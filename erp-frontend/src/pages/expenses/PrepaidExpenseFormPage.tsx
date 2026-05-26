import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Calculator, AlertTriangle, Info, Link2 } from 'lucide-react';
import {
  useCreatePrepaidExpense,
  useUpdatePrepaidExpense,
  usePrepaidExpense,
} from '../../hooks/usePrepaidExpenses';
import { useExpenseCategories } from '../../hooks/useExpenseCategories';
import { useAllSuppliers } from '../../hooks/useSuppliers';
import { useActiveResources } from '../../hooks/useResources';
import { CreatePrepaidExpense, ValidationError } from '../../types/prepaidExpense';

const PrepaidExpenseFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  const [formData, setFormData] = useState<Partial<CreatePrepaidExpense>>({
    purchase_date: new Date().toISOString().split('T')[0],
    measurable: false,
  });
  const [errors, setErrors] = useState<ValidationError>({});
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [linkedResourceId, setLinkedResourceId] = useState<number | undefined>(undefined);
  const [createdResource, setCreatedResource] = useState<any>(null);

  // Queries
  const { data: existingExpense } = usePrepaidExpense(Number(id), isEditing);
  const { data: expenseCategoriesResponse } = useExpenseCategories();
  const expenseCategoriesData = expenseCategoriesResponse?.results;
  const { data: suppliersData = [] } = useAllSuppliers({ is_active: true });
  const { data: activeResourcesData } = useActiveResources();

  // Mutations
  const createPrepaidExpense = useCreatePrepaidExpense();
  const updatePrepaidExpense = useUpdatePrepaidExpense();

  // Load existing data for editing
  useEffect(() => {
    if (existingExpense && isEditing) {
      setFormData({
        category: existingExpense.category,
        purchase_date: existingExpense.purchase_date,
        description: existingExpense.description,
        total_amount: existingExpense.total_amount,
        measurable: existingExpense.measurable,
        unit_of_measure: existingExpense.unit_of_measure,
        total_units: existingExpense.total_units,
        consumed_units: existingExpense.consumed_units,
        unit_cost: existingExpense.unit_cost,
        supplier_name: existingExpense.supplier_name,
        supplier_invoice: existingExpense.supplier_invoice,
      });

      // Find and set the selected category
      if (expenseCategoriesData) {
        const category = expenseCategoriesData.find(
          (cat: any) => cat.id === existingExpense.category
        );
        if (category) setSelectedCategory(category);
      }

      // Restore selected supplier by matching supplier ID or name
      if (suppliersData) {
        const supplier = existingExpense.supplier
          ? suppliersData.find((s: any) => s.id === existingExpense.supplier)
          : suppliersData.find((s: any) => s.name === existingExpense.supplier_name);
        if (supplier) setSelectedSupplier(supplier);
      }
    }
  }, [existingExpense, isEditing, expenseCategoriesData, suppliersData]);

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

  const handleCategoryChange = (category: any) => {
    setSelectedCategory(category);
    handleInputChange('category', category.id);
  };

  const handleMeasurableChange = (measurable: boolean) => {
    handleInputChange('measurable', measurable);

    // Clear unit-related fields if not measurable
    if (!measurable) {
      handleInputChange('unit_of_measure', '');
      handleInputChange('total_units', '');
      handleInputChange('consumed_units', '');
      handleInputChange('unit_cost', '');
    }
  };

  const handleUnitsChange = (units: string) => {
    handleInputChange('total_units', units);

    // Auto-calculate unit cost if total amount is available
    if (formData.total_amount && units) {
      const totalAmount = parseFloat(formData.total_amount);
      const totalUnits = parseFloat(units);
      if (totalUnits > 0) {
        // FIX: Use 2 decimal places instead of 4
        const unitCost = (totalAmount / totalUnits).toFixed(2);
        handleInputChange('unit_cost', unitCost);
      }
    }
  };

  const handleAmountChange = (amount: string) => {
    handleInputChange('total_amount', amount);

    // Auto-calculate unit cost if total units is available
    if (formData.total_units && amount) {
      const totalAmount = parseFloat(amount);
      const totalUnits = parseFloat(formData.total_units);
      if (totalUnits > 0) {
        // FIX: Use 2 decimal places instead of 4
        const unitCost = (totalAmount / totalUnits).toFixed(2);
        handleInputChange('unit_cost', unitCost);
      }
    }
  };

  const calculateUnitCost = () => {
    if (formData.total_units && formData.total_amount) {
      const units = parseFloat(formData.total_units);
      const amount = parseFloat(formData.total_amount);
      // FIX: Use 2 decimal places
      return units > 0 ? (amount / units).toFixed(2) : '0.00';
    }
    return '0.00';
  };
  const validateForm = (): boolean => {
    const newErrors: ValidationError = {};

    // Required field validations
    if (!formData.category) newErrors.category = ['Expense category is required'];
    if (!formData.description) newErrors.description = ['Description is required'];
    if (!formData.total_amount) newErrors.total_amount = ['Total amount is required'];
    if (!formData.supplier_name) newErrors.supplier_name = ['Supplier is required'];

    // Numeric validations
    if (formData.total_amount && (isNaN(parseFloat(formData.total_amount)) || parseFloat(formData.total_amount) <= 0)) {
      newErrors.total_amount = ['Total amount must be greater than 0'];
    }

    // Measurable validations
    if (formData.measurable) {
      if (!formData.unit_of_measure)
        newErrors.unit_of_measure = ['Unit of measure is required for measurable expenses'];
      if (!formData.total_units)
        newErrors.total_units = ['Total units is required for measurable expenses'];

      if (formData.total_units && (isNaN(parseFloat(formData.total_units)) || parseFloat(formData.total_units) <= 0)) {
        newErrors.total_units = ['Total units must be greater than 0'];
      }

      if (formData.consumed_units && formData.total_units) {
        const consumed = parseFloat(formData.consumed_units);
        const total = parseFloat(formData.total_units);
        if (consumed > total) {
          newErrors.consumed_units = ['Consumed units cannot exceed total units'];
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    // Include the selected resource if set
    const submitData: any = { ...formData };
    if (linkedResourceId) submitData.resource = linkedResourceId;

    try {
      if (isEditing) {
        await updatePrepaidExpense.mutateAsync({
          id: Number(id),
          data: submitData,
        });
        alert('Prepaid expense updated successfully');
      } else {
        const result = await createPrepaidExpense.mutateAsync(submitData as CreatePrepaidExpense);
        // Show created/linked resource info so user knows where to track consumption
        if (result.created_resource) {
          setCreatedResource(result.created_resource);
          return; // stay on page to show the resource information
        }
        alert(
          `Prepaid expense ${result.reference_number} created. Record consumption at Expenses → Record Consumption.`
        );
      }
      navigate('/expenses/prepaid');
    } catch (error: any) {
      if (error.response?.data) {
        setErrors(error.response.data);
      } else {
        alert('Failed to save prepaid expense');
      }
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/expenses/prepaid')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={20} />
          Back to Prepaid Expenses
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditing ? 'Edit' : 'Create'} Prepaid Expense
          </h1>
          <p className="text-gray-600">
            {isEditing
              ? 'Update prepaid expense details'
              : 'Record a new prepaid expense for future amortization'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expense Category *
              </label>
              <select
                value={formData.category || ''}
                onChange={e => {
                  const category = expenseCategoriesData?.find(
                    (cat: any) => cat.id === Number(e.target.value)
                  );
                  if (category) handleCategoryChange(category);
                }}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.category ? 'border-red-300' : 'border-gray-300'
                }`}
                aria-label="Expense category"
                required
              >
                <option value="">Select expense category...</option>
                {expenseCategoriesData?.map((category: any) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {errors.category && <p className="mt-1 text-sm text-red-600">{errors.category[0]}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
              <input
                type="date"
                value={formData.purchase_date || ''}
                onChange={e => handleInputChange('purchase_date', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                aria-label="Purchase date"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
              <textarea
                rows={3}
                value={formData.description || ''}
                onChange={e => handleInputChange('description', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.description ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Describe the prepaid expense..."
                required
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600">{errors.description[0]}</p>
              )}
            </div>
          </div>

          {selectedCategory && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-md p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Category Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
                <div>
                  <span className="font-medium">Expense Account:</span>
                  <span className="ml-2">{selectedCategory.expense_account_name}</span>
                </div>
                {selectedCategory.prepaid_account_name && (
                  <div>
                    <span className="font-medium">Prepaid Account:</span>
                    <span className="ml-2">{selectedCategory.prepaid_account_name}</span>
                  </div>
                )}
                {selectedCategory.requires_approval && (
                  <div className="md:col-span-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      <AlertTriangle size={12} className="mr-1" />
                      Requires Approval
                    </span>
                    {selectedCategory.approval_threshold && (
                      <span className="ml-2 text-xs">
                        (Threshold: ₦
                        {parseFloat(selectedCategory.approval_threshold).toLocaleString()})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Amount Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Amount Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.total_amount || ''}
                onChange={e => handleAmountChange(e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.total_amount ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0.00"
                required
              />
              {errors.total_amount && (
                <p className="mt-1 text-sm text-red-600">{errors.total_amount[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Measurable Expense
              </label>
              <div className="flex items-center gap-4 mt-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="measurable"
                    checked={!formData.measurable}
                    onChange={() => handleMeasurableChange(false)}
                    className="mr-2"
                  />
                  No (Amount only)
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="measurable"
                    checked={formData.measurable}
                    onChange={() => handleMeasurableChange(true)}
                    className="mr-2"
                  />
                  Yes (Has units)
                </label>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Choose "Yes" if this expense can be measured in units (liters, kg, hours, etc.)
              </p>
            </div>
          </div>
        </div>

        {/* Unit Information (only if measurable) */}
        {formData.measurable && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Unit Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit of Measure *
                </label>
                <input
                  type="text"
                  value={formData.unit_of_measure || ''}
                  onChange={e => handleInputChange('unit_of_measure', e.target.value)}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.unit_of_measure ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="e.g., liters, kg, hours"
                  maxLength={20}
                  required
                />
                {errors.unit_of_measure && (
                  <p className="mt-1 text-sm text-red-600">{errors.unit_of_measure[0]}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Units *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.total_units || ''}
                  onChange={e => handleUnitsChange(e.target.value)}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.total_units ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  required
                />
                {errors.total_units && (
                  <p className="mt-1 text-sm text-red-600">{errors.total_units[0]}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit Cost (Calculated)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={`₦${calculateUnitCost()}`}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50"
                    aria-label="Calculated unit cost"
                    readOnly
                  />
                  <Calculator size={16} className="text-gray-400" />
                </div>
                <p className="mt-1 text-xs text-gray-500">Amount ÷ Units</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Consumed Units
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.consumed_units || ''}
                  onChange={e => handleInputChange('consumed_units', e.target.value)}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.consumed_units ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                />
                {errors.consumed_units && (
                  <p className="mt-1 text-sm text-red-600">{errors.consumed_units[0]}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">Units already consumed/used</p>
              </div>
            </div>

            {/* Auto-calculation notice */}
            <div className="mt-4 bg-green-50 border border-green-200 rounded-md p-3">
              <div className="flex items-center gap-2">
                <Calculator size={16} className="text-green-600" />
                <span className="text-sm font-medium text-green-900">Auto-calculation enabled</span>
              </div>
              <p className="text-sm text-green-700 mt-1">
                Unit cost is automatically calculated when you enter both total amount and total
                units.
              </p>
            </div>
          </div>
        )}

        {/* Resource Tracking Link — shown for all prepaid expenses */}
        {
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Link2 size={18} className="text-blue-600" />
              Resource Tracking
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Link this purchase to a resource catalog item so consumption can be tracked against it
              (e.g., "Premium Diesel – tracked by odometer"). If left blank, a resource will be
              created automatically.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Link to Resource (optional)
              </label>
              <select
                aria-label="Link to resource"
                value={linkedResourceId || ''}
                onChange={e => setLinkedResourceId(Number(e.target.value) || undefined)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">Auto-create a new resource for this purchase</option>
                {activeResourcesData?.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.unit_of_measure}) — {r.resource_type}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Use an existing resource if this is a repeat purchase of the same item (e.g.,
                monthly diesel top-up). Multiple prepaid expenses can share one resource, and you'll
                see combined consumption history in one place.
              </p>
            </div>
            {linkedResourceId && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800 flex items-center gap-2">
                <Info size={16} className="shrink-0" />
                Consumption recorded through vouchers from this expense will be attributed to the
                selected resource.
              </div>
            )}
          </div>
        }

        {/* Supplier Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Supplier Information</h2>

          {/* Accounting flow explanation */}
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
            <strong>Accounting flow:</strong> Selecting a supplier creates an accounts payable entry
            for them. When the supplier is paid via a bank payment the payable is cleared, and the
            prepaid balance is then gradually recognised as expense through amortisation.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
              <select
                value={selectedSupplier?.id || ''}
                onChange={e => {
                  const supplier = suppliersData?.find(
                    (s: any) => s.id === Number(e.target.value)
                  );
                  if (supplier) {
                    setSelectedSupplier(supplier);
                    handleInputChange('supplier_name', supplier.name);
                    handleInputChange('supplier', supplier.id);
                  } else {
                    setSelectedSupplier(null);
                    handleInputChange('supplier_name', '');
                    handleInputChange('supplier', undefined);
                  }
                }}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.supplier_name ? 'border-red-300' : 'border-gray-300'
                }`}
                aria-label="Supplier"
              >
                <option value="">Select supplier...</option>
                {suppliersData?.map((supplier: any) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              {errors.supplier_name && (
                <p className="mt-1 text-sm text-red-600">{errors.supplier_name[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supplier Invoice
              </label>
              <input
                type="text"
                value={formData.supplier_invoice || ''}
                onChange={e => handleInputChange('supplier_invoice', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Invoice number or reference"
                maxLength={100}
              />
            </div>
          </div>
        </div>

        {/* Summary */}
        {formData.total_amount && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Expense Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-blue-700 font-medium">Total Amount:</span>
                <p className="text-lg font-bold text-blue-900">
                  ₦
                  {parseFloat(formData.total_amount).toLocaleString('en-NG', {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
              {formData.measurable && formData.total_units && (
                <>
                  <div>
                    <span className="text-blue-700 font-medium">Total Units:</span>
                    <p className="text-lg font-bold text-blue-900">
                      {formData.total_units} {formData.unit_of_measure}
                    </p>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Unit Cost:</span>
                    <p className="text-lg font-bold text-blue-900">
                      ₦{calculateUnitCost()}/{formData.unit_of_measure}
                    </p>
                  </div>
                </>
              )}
            </div>
            {formData.consumed_units && parseFloat(formData.consumed_units) > 0 && (
              <div className="mt-4 pt-4 border-t border-blue-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-700 font-medium">Consumed Units:</span>
                    <p className="text-blue-900">
                      {formData.consumed_units} {formData.unit_of_measure}
                    </p>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Remaining Units:</span>
                    <p className="text-blue-900">
                      {(
                        parseFloat(formData.total_units || '0') -
                        parseFloat(formData.consumed_units)
                      ).toFixed(2)}{' '}
                      {formData.unit_of_measure}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/expenses/prepaid')}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createPrepaidExpense.isPending || updatePrepaidExpense.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={20} />
            {createPrepaidExpense.isPending || updatePrepaidExpense.isPending
              ? 'Saving...'
              : isEditing
                ? 'Update Expense'
                : 'Create Expense'}
          </button>
        </div>
      </form>

      {/* Post-creation: show linked resource so user knows where to track consumption */}
      {createdResource && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                <Link2 size={20} className="text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Prepaid Expense Created</h3>
                <p className="text-sm text-gray-500">
                  Linked to a resource for consumption tracking
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
              <p className="text-sm font-medium text-blue-900 mb-2">Resource Details</p>
              <div className="space-y-1 text-sm text-blue-800">
                <div>
                  <span className="font-medium">Name:</span> {createdResource.name}
                </div>
                <div>
                  <span className="font-medium">Code:</span> {createdResource.resource_code}
                </div>
                <div>
                  <span className="font-medium">Unit:</span> {createdResource.unit_of_measure}
                </div>
                <div>
                  <span className="font-medium">Type:</span> {createdResource.resource_type}
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-5">
              When recording fuel/consumption, select this resource to track usage against this
              expense. You can also link it to a voucher from the voucher creation page.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => navigate('/expenses/prepaid')}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Go to Expenses
              </button>
              <button
                onClick={() => navigate('/expenses/vouchers/create')}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Create Voucher →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrepaidExpenseFormPage;
