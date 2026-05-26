import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, Info, Plus, X, AlertTriangle } from 'lucide-react';
import {
  useCreateConsumption,
  useUpdateConsumption,
  useConsumption,
} from '../../hooks/useResourceConsumption';
import { useActiveResources, useCreateResource } from '../../hooks/useResources';
import { useExpenseCategories } from '../../hooks/useExpenseCategories';
import { useExpenseAccounts } from '../../hooks/useAccountsSimple';
import { useAllSuppliers } from '../../hooks/useSuppliers';
import { useActiveVouchers } from '../../hooks/usePrepaidVouchers';
import { useAllStaff } from '../../hooks/useStaff';
import {
  CreatePrepaidConsumption,
  CreatePostpaidConsumption,
  ValidationError,
} from '../../types/consumption';

// Returns human-readable labels for each tracking method
const READING_LABELS: Record<string, { singular: string; unit: string; efficiency: string }> = {
  odometer: { singular: 'Odometer', unit: 'km', efficiency: 'km / litre' },
  hours: { singular: 'Engine Hours', unit: 'hrs', efficiency: 'litres / hour' },
  meter: { singular: 'Meter Reading', unit: 'units', efficiency: 'units / period' },
  cycles: { singular: 'Cycle Count', unit: 'cycles', efficiency: 'litres / cycle' },
  quantity: { singular: 'Quantity', unit: 'units', efficiency: 'N/A' },
  none: { singular: 'Reading', unit: 'units', efficiency: 'N/A' },
};

const ResourceConsumptionFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditing = !!id;

  // Query-string pre-fills (e.g. from AssetDetailPage "Log Consumption" button
  // or from featureRegistry "Utility Bills" entry)
  const prefilledAssetId = searchParams.get('asset_id');
  const prefilledType = searchParams.get('type'); // 'utility' → electricity, no asset

  const [paymentFlow, setPaymentFlow] = useState<'prepaid' | 'postpaid'>('prepaid');
  const [formData, setFormData] = useState<
    Partial<CreatePrepaidConsumption | CreatePostpaidConsumption>
  >({
    payment_flow: 'prepaid',
    consumption_date: new Date().toISOString().split('T')[0],
    // When opened from an asset page, default beneficiary_type to asset
    // When opened as a utility bill, default to no asset (beneficiary_type stays asset but asset=null)
    beneficiary_type: 'asset',
    // Pre-fill asset FK if asset_id was passed in URL
    ...(prefilledAssetId ? { asset: Number(prefilledAssetId) } : {}),
  });
  const [errors, setErrors] = useState<ValidationError>({});
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [selectedResource, setSelectedResource] = useState<any>(null);

  // Quick-create resource modal state
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [newResourceData, setNewResourceData] = useState({
    name: '',
    resource_type: 'fuel',
    unit_of_measure: '',
    default_tracking_method: 'quantity',
    default_unit_cost: '',
    expense_category: undefined as number | undefined,
  });
  const [resourceModalError, setResourceModalError] = useState<string | null>(null);

  // Derived: whether reading fields should be shown and what to call them
  const trackingMethod: string = selectedResource?.default_tracking_method || 'none';
  const showReadingFields = trackingMethod !== 'none' && trackingMethod !== 'quantity';
  const readingLabel = READING_LABELS[trackingMethod] ?? READING_LABELS.none;

  // Queries - Now using real APIs
  const { data: existingConsumption } = useConsumption(Number(id), isEditing);
  const { data: suppliersData = [] } = useAllSuppliers({ is_active: true });
  const { data: resourcesData } = useActiveResources();
  const { data: vouchersData } = useActiveVouchers();
  const { data: staffData = [] } = useAllStaff({ is_active: true });
  const createResourceMutation = useCreateResource();
  const { data: expenseCategoriesData } = useExpenseCategories();
  const { data: expenseAccountsData } = useExpenseAccounts();
  // Mutations
  const createConsumption = useCreateConsumption();
  const updateConsumption = useUpdateConsumption();

  // Load existing data for editing
  useEffect(() => {
    if (existingConsumption && isEditing) {
      setPaymentFlow(existingConsumption.payment_flow);
      setFormData({
        payment_flow: existingConsumption.payment_flow,
        prepaid_voucher: existingConsumption.prepaid_voucher,
        supplier: existingConsumption.supplier,
        resource: existingConsumption.resource,
        consumption_date: existingConsumption.consumption_date,
        quantity_consumed: existingConsumption.quantity_consumed,
        unit_cost: existingConsumption.unit_cost,
        beneficiary_type: existingConsumption.beneficiary_type,
        beneficiary_name: existingConsumption.beneficiary_name,
        beneficiary_reference: existingConsumption.beneficiary_reference,
        asset: existingConsumption.asset,
        employee: existingConsumption.employee,
        reading_type: existingConsumption.reading_type,
        previous_reading: existingConsumption.previous_reading,
        current_reading: existingConsumption.current_reading,
        operator_name: existingConsumption.operator_name,
        operator: existingConsumption.operator,
        consumption_location: existingConsumption.consumption_location,
        receipt_number: existingConsumption.receipt_number,
        invoice_number: existingConsumption.invoice_number,
        notes: existingConsumption.notes,
      });

      // Set selected voucher if exists
      if (existingConsumption.prepaid_voucher && vouchersData) {
        const voucher = vouchersData.find((v: any) => v.id === existingConsumption.prepaid_voucher);
        if (voucher) setSelectedVoucher(voucher);
      }

      // Set selected resource if exists
      if (existingConsumption.resource && resourcesData) {
        const resource = resourcesData.find((r: any) => r.id === existingConsumption.resource);
        if (resource) setSelectedResource(resource);
      }
    }
  }, [existingConsumption, isEditing, vouchersData, resourcesData]);

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

  const handlePaymentFlowChange = (flow: 'prepaid' | 'postpaid') => {
    setPaymentFlow(flow);
    setFormData(prev => ({
      ...prev,
      payment_flow: flow,
      prepaid_voucher: undefined,
      supplier: undefined,
    }));
    setSelectedVoucher(null);
  };

  const handleVoucherChange = (voucher: any) => {
    setSelectedVoucher(voucher);
    handleInputChange('prepaid_voucher', voucher.id);
    // Auto-populate beneficiary from voucher
    if (voucher.beneficiary_name) {
      handleInputChange('beneficiary_name', voucher.beneficiary_name);
    }
    if (voucher.beneficiary_reference) {
      handleInputChange('beneficiary_reference', voucher.beneficiary_reference);
    }
    if (voucher.beneficiary_type) {
      handleInputChange('beneficiary_type', voucher.beneficiary_type);
    }
    // Auto-populate previous_reading from voucher's baseline (odometer/hours at issue)
    // This seeds the first consumption's previous reading so the chain starts correctly
    if (voucher.odometer_reading) {
      handleInputChange('previous_reading', voucher.odometer_reading);
      // Set reading_type from currently-selected resource or leave for user
      if (selectedResource?.default_tracking_method) {
        handleInputChange('reading_type', selectedResource.default_tracking_method);
      }
    }
    // Auto-select the resource linked to this voucher's prepaid expense
    if (voucher.linked_resource && resourcesData) {
      const matchedResource = resourcesData.find((r: any) => r.id === voucher.linked_resource.id);
      if (matchedResource) {
        handleResourceChange(matchedResource);
      }
    }
  };

  const handleResourceChange = (resource: any) => {
    setSelectedResource(resource);
    handleInputChange('resource', resource.id);
    // Set reading_type from resource default
    if (resource.default_tracking_method) {
      handleInputChange('reading_type', resource.default_tracking_method);
    }
    // Auto-fill unit cost from resource
    if (resource.default_unit_cost) {
      handleInputChange('unit_cost', resource.default_unit_cost);
    }
  };

  const handleQuickCreateResource = async () => {
    setResourceModalError(null);
    if (!newResourceData.name.trim()) {
      setResourceModalError('Resource name is required');
      return;
    }
    if (!newResourceData.unit_of_measure.trim()) {
      setResourceModalError('Unit of measure is required');
      return;
    }
    if (!newResourceData.expense_category) {
      setResourceModalError('Expense category is required');
      return;
    }
    try {
      const created = await createResourceMutation.mutateAsync(newResourceData as any);
      // Select the newly created resource automatically
      handleResourceChange(created);
      setShowResourceModal(false);
      setNewResourceData({
        name: '',
        resource_type: 'fuel',
        unit_of_measure: '',
        default_tracking_method: 'quantity',
        default_unit_cost: '',
        expense_category: undefined,
      });
    } catch (error: any) {
      const data = error.response?.data;
      if (data && typeof data === 'object') {
        // Collect all field errors into one readable string
        const messages = Object.entries(data)
          .map(([field, errs]) => `${field}: ${Array.isArray(errs) ? errs.join(', ') : errs}`)
          .join('  |  ');
        setResourceModalError(messages || 'Failed to create resource');
      } else {
        setResourceModalError(error.message || 'Failed to create resource');
      }
    }
  };

  const calculateTotalCost = () => {
    const quantity = parseFloat(formData.quantity_consumed || '0');
    const unitCost = parseFloat(formData.unit_cost || '0');
    return (quantity * unitCost).toFixed(2);
  };

  const calculateUsage = () => {
    if (formData.current_reading && formData.previous_reading) {
      const current = parseFloat(formData.current_reading);
      const previous = parseFloat(formData.previous_reading);
      return (current - previous).toFixed(2);
    }
    return '0.00';
  };

  const validateForm = (): boolean => {
    const newErrors: ValidationError = {};

    // Common validations
    if (!formData.resource) newErrors.resource = ['Resource is required'];
    if (!formData.consumption_date) newErrors.consumption_date = ['Consumption date is required'];
    if (!formData.quantity_consumed) newErrors.quantity_consumed = ['Quantity is required'];
    if (!formData.unit_cost) newErrors.unit_cost = ['Unit cost is required'];
    if (!formData.beneficiary_name) newErrors.beneficiary_name = ['Beneficiary name is required'];
    if (!formData.consumption_location) newErrors.consumption_location = ['Location is required'];

    // Payment flow specific validations
    if (paymentFlow === 'prepaid') {
      if (!formData.prepaid_voucher)
        newErrors.prepaid_voucher = ['Voucher is required for prepaid flow'];
      if (!formData.operator && !formData.operator_name)
        newErrors.operator_name = ['Operator is required'];

      // Voucher balance validation
      if (selectedVoucher && formData.quantity_consumed) {
        const quantity = parseFloat(formData.quantity_consumed);
        const available = parseFloat(selectedVoucher.remaining_units);
        if (quantity > available) {
          newErrors.quantity_consumed = [`Exceeds available balance (${available} units)`];
        }
      }
    } else {
      if (!formData.supplier) newErrors.supplier = ['Supplier is required for postpaid flow'];
    }

    // Reading validations
    if (formData.reading_type && formData.current_reading && formData.previous_reading) {
      const current = parseFloat(formData.current_reading);
      const previous = parseFloat(formData.previous_reading);
      if (current < previous) {
        newErrors.current_reading = ['Current reading must be greater than previous reading'];
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      // Prepare the submission data with required fields
      const submissionData = {
        ...formData,
        // Add unit_of_measure from selected resource
        unit_of_measure: selectedResource?.unit_of_measure || 'units',
        // Calculate and add total_cost
        total_cost: calculateTotalCost(),
      };

      if (isEditing) {
        await updateConsumption.mutateAsync({
          id: Number(id),
          data: submissionData,
        });
        alert('Consumption updated successfully');
      } else {
        const result = await createConsumption.mutateAsync(
          submissionData as CreatePrepaidConsumption | CreatePostpaidConsumption
        );
        alert(`Consumption ${result.consumption_number} created successfully`);
      }
      navigate('/expenses/resource-consumption');
    } catch (error: any) {
      if (error.response?.data) {
        setErrors(error.response.data);
      } else {
        alert('Failed to save consumption');
      }
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/expenses/resource-consumption')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={20} />
          Back to List
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditing
              ? 'Edit Resource Consumption'
              : prefilledType === 'utility'
                ? '💡 Record Utility Bill'
                : 'Record Resource Consumption'}
          </h1>
          <p className="text-gray-600">
            {isEditing
              ? 'Update consumption details'
              : prefilledType === 'utility'
                ? 'Record a NEPA electricity, water or gas bill — no asset required'
                : 'Track resource usage with prepaid vouchers or postpaid billing'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Utility Bill Mode notice */}
        {prefilledType === 'utility' && !isEditing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Info size={16} className="text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Utility Bill Mode</span>
            </div>
            <p className="text-sm text-blue-700 mt-1">
              You are recording a utility bill (electricity, water or gas). The Resource dropdown is
              filtered to utility-type resources. Leave the <strong>Asset</strong> field blank if
              this is a facility-wide bill not tied to a specific asset.
            </p>
          </div>
        )}

        {/* Asset pre-fill notice */}
        {prefilledAssetId && !isEditing && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Info size={16} className="text-amber-600" />
              <span className="text-sm font-medium text-amber-800">Asset Pre-filled</span>
            </div>
            <p className="text-sm text-amber-700 mt-1">
              This consumption will be linked to asset ID <strong>{prefilledAssetId}</strong>. You
              can change the asset below if needed.
            </p>
          </div>
        )}

        {/* API Integration Notice */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-600" />
            <span className="text-sm font-medium text-green-800">Real API Integration</span>
          </div>
          <p className="text-sm text-green-700 mt-1">
            This form now uses real APIs for resources and vouchers. All data is fetched from the
            backend services and consumption records are saved to the database.
          </p>
        </div>

        {/* Payment Flow Selection */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Flow</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label
              className={`relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
                paymentFlow === 'prepaid' ? 'border-blue-600 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="payment_flow"
                value="prepaid"
                checked={paymentFlow === 'prepaid'}
                onChange={() => handlePaymentFlowChange('prepaid')}
                className="sr-only"
                disabled={isEditing}
              />
              <div className="flex flex-1">
                <div className="flex flex-col">
                  <span className="block text-sm font-medium text-gray-900">Prepaid (Voucher)</span>
                  <span className="mt-1 flex items-center text-sm text-gray-500">
                    Use existing vouchers for fuel, supplies, etc.
                  </span>
                </div>
              </div>
              {paymentFlow === 'prepaid' && <CheckCircle className="h-5 w-5 text-blue-600" />}
            </label>

            <label
              className={`relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
                paymentFlow === 'postpaid' ? 'border-blue-600 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="payment_flow"
                value="postpaid"
                checked={paymentFlow === 'postpaid'}
                onChange={() => handlePaymentFlowChange('postpaid')}
                className="sr-only"
                disabled={isEditing}
              />
              <div className="flex flex-1">
                <div className="flex flex-col">
                  <span className="block text-sm font-medium text-gray-900">
                    Postpaid (Invoice)
                  </span>
                  <span className="mt-1 flex items-center text-sm text-gray-500">
                    Bill after consumption for utilities, services, etc.
                  </span>
                </div>
              </div>
              {paymentFlow === 'postpaid' && <CheckCircle className="h-5 w-5 text-blue-600" />}
            </label>
          </div>
        </div>

        {/* Voucher/Supplier Selection */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {paymentFlow === 'prepaid' ? 'Voucher Selection' : 'Supplier Information'}
          </h2>

          {paymentFlow === 'prepaid' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Voucher *
                </label>
                <select
                  aria-label="Select prepaid voucher"
                  value={formData.prepaid_voucher || ''}
                  onChange={e => {
                    const voucher = vouchersData?.find((v: any) => v.id === Number(e.target.value));
                    if (voucher) handleVoucherChange(voucher);
                  }}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.prepaid_voucher ? 'border-red-300' : 'border-gray-300'
                  }`}
                  required
                >
                  <option value="">Select a voucher...</option>
                  {vouchersData?.map((voucher: any) => (
                    <option key={voucher.id} value={voucher.id}>
                      {voucher.voucher_number} — {voucher.prepaid_expense_name}
                      {voucher.linked_resource ? ` (${voucher.linked_resource.name})` : ''} ·{' '}
                      {voucher.remaining_units}{' '}
                      {voucher.linked_resource?.unit_of_measure || 'units'} left
                    </option>
                  ))}
                </select>
                {errors.prepaid_voucher && (
                  <p className="mt-1 text-sm text-red-600">{errors.prepaid_voucher[0]}</p>
                )}
              </div>

              {selectedVoucher && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Info size={16} className="text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">Voucher Details</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-blue-700">Available Units:</span>
                      <span className="ml-2 font-medium">{selectedVoucher.remaining_units}</span>
                    </div>
                    <div>
                      <span className="text-blue-700">Available Amount:</span>
                      <span className="ml-2 font-medium">₦{selectedVoucher.remaining_amount}</span>
                    </div>
                    {selectedVoucher.linked_resource && (
                      <div className="col-span-2 mt-1 pt-2 border-t border-blue-200">
                        <span className="text-blue-700">Tracking Resource:</span>
                        <span className="ml-2 font-medium text-blue-900">
                          {selectedVoucher.linked_resource.name}
                        </span>
                        <span className="ml-2 text-blue-600 text-xs">
                          ({selectedVoucher.linked_resource.unit_of_measure} ·{' '}
                          {selectedVoucher.linked_resource.default_tracking_method} tracking)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
                <select
                  aria-label="Select supplier"
                  value={formData.supplier || ''}
                  onChange={e => handleInputChange('supplier', Number(e.target.value) || undefined)}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.supplier ? 'border-red-300' : 'border-gray-300'
                  }`}
                  required
                >
                  <option value="">Select supplier...</option>
                  {suppliersData?.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                {errors.supplier && (
                  <p className="mt-1 text-sm text-red-600">{errors.supplier[0]}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={formData.invoice_number || ''}
                  onChange={e => handleInputChange('invoice_number', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="INV-2026-001"
                />
              </div>
            </div>
          )}
        </div>

        {/* Resource Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Resource Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Resource *</label>
              <div className="flex gap-2">
                <select
                  aria-label="Select resource"
                  value={formData.resource || ''}
                  onChange={e => {
                    const resource = resourcesData?.find(
                      (r: any) => r.id === Number(e.target.value)
                    );
                    if (resource) handleResourceChange(resource);
                  }}
                  className={`flex-1 border rounded-md px-3 py-2 ${
                    errors.resource ? 'border-red-300' : 'border-gray-300'
                  }`}
                  required
                >
                  <option value="">Select resource...</option>
                  {(prefilledType === 'utility'
                    ? resourcesData?.filter((r: any) =>
                        ['electricity', 'water', 'gas'].includes(r.resource_type)
                      )
                    : resourcesData
                  )?.map((resource: any) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name} ({resource.unit_of_measure})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowResourceModal(true)}
                  className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-1 shrink-0"
                  title="Create new resource"
                  aria-label="Create new resource"
                >
                  <Plus size={16} />
                  <span className="hidden sm:inline text-sm">New</span>
                </button>
              </div>
              {errors.resource && <p className="mt-1 text-sm text-red-600">{errors.resource[0]}</p>}
              {resourcesData?.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  No resources found — click "+ New" to create one first.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Consumption Date *
              </label>
              <input
                type="date"
                value={formData.consumption_date || ''}
                onChange={e => handleInputChange('consumption_date', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.consumption_date ? 'border-red-300' : 'border-gray-300'
                }`}
                aria-label="Consumption date"
                required
              />
              {errors.consumption_date && (
                <p className="mt-1 text-sm text-red-600">{errors.consumption_date[0]}</p>
              )}
            </div>
          </div>
        </div>

        {/* Consumption Details */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Consumption Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity Consumed *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.quantity_consumed || ''}
                onChange={e => handleInputChange('quantity_consumed', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.quantity_consumed ? 'border-red-300' : 'border-gray-300'
                }`}
                aria-label="Quantity consumed"
                required
              />
              {errors.quantity_consumed && (
                <p className="mt-1 text-sm text-red-600">{errors.quantity_consumed[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.unit_cost || ''}
                onChange={e => handleInputChange('unit_cost', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.unit_cost ? 'border-red-300' : 'border-gray-300'
                }`}
                aria-label="Unit cost"
                required
              />
              {errors.unit_cost && (
                <p className="mt-1 text-sm text-red-600">{errors.unit_cost[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Cost</label>
              <input
                type="text"
                value={`$${calculateTotalCost()}`}
                className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50"
                aria-label="Calculated total cost"
                readOnly
              />
            </div>
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
                aria-label="Beneficiary type"
                value={formData.beneficiary_type || 'asset'}
                onChange={e => handleInputChange('beneficiary_type', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                required
              >
                <option value="asset">Asset</option>
                <option value="employee">Employee</option>
                <option value="department">Department</option>
                <option value="location">Location</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Beneficiary Name *
              </label>
              {formData.beneficiary_type === 'employee' ? (
                <select
                  value={formData.employee || ''}
                  onChange={e => {
                    const selectedId = parseInt(e.target.value, 10);
                    const selectedStaff = staffData?.find((s: any) => s.id === selectedId);
                    handleInputChange('employee', selectedId || null);
                    if (selectedStaff) {
                      handleInputChange('beneficiary_name', selectedStaff.full_name);
                    }
                  }}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.beneficiary_name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  aria-label="Beneficiary employee"
                  required
                >
                  <option value="">Select employee...</option>
                  {staffData?.map((staff: any) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.full_name}
                      {staff.department ? ` — ${staff.department}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.beneficiary_name || ''}
                  onChange={e => handleInputChange('beneficiary_name', e.target.value)}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.beneficiary_name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="e.g., Company Vehicle, Factory Building A"
                  required
                />
              )}
              {errors.beneficiary_name && (
                <p className="mt-1 text-sm text-red-600">{errors.beneficiary_name[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference Number
              </label>
              <input
                type="text"
                value={formData.beneficiary_reference || ''}
                onChange={e => handleInputChange('beneficiary_reference', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="e.g., VEH-001, LOC-FACTORY-A"
              />
            </div>
          </div>
        </div>

        {/* Meter / Odometer / Hours Readings */}
        {showReadingFields && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {readingLabel.singular} Readings
              </h2>
              <span className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-1">
                Efficiency: {readingLabel.efficiency}
              </span>
            </div>
            {selectedVoucher?.odometer_reading && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                <strong>Baseline at voucher issue:</strong> {selectedVoucher.odometer_reading}{' '}
                {readingLabel.unit}
                &nbsp;— auto-filled as previous reading below.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Previous {readingLabel.singular} ({readingLabel.unit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.previous_reading || ''}
                  onChange={e => handleInputChange('previous_reading', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  aria-label={`Previous ${readingLabel.singular}`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current {readingLabel.singular} ({readingLabel.unit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.current_reading || ''}
                  onChange={e => handleInputChange('current_reading', e.target.value)}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.current_reading ? 'border-red-300' : 'border-gray-300'
                  }`}
                  aria-label={`Current ${readingLabel.singular}`}
                />
                {errors.current_reading && (
                  <p className="mt-1 text-sm text-red-600">{errors.current_reading[0]}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {readingLabel.singular} Used ({readingLabel.unit})
                </label>
                <input
                  type="text"
                  value={calculateUsage()}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50"
                  readOnly
                  aria-label="Usage since last reading"
                />
              </div>
            </div>
          </div>
        )}

        {/* Documentation */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Documentation</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paymentFlow === 'prepaid' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Operator (Staff) *
                </label>
                <select
                  value={formData.operator || ''}
                  onChange={e => {
                    const selectedId = parseInt(e.target.value, 10);
                    const selectedStaff = staffData?.find((s: any) => s.id === selectedId);
                    handleInputChange('operator', selectedId || null);
                    if (selectedStaff) {
                      handleInputChange('operator_name', selectedStaff.full_name);
                    }
                  }}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.operator_name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  aria-label="Operator staff member"
                  required
                >
                  <option value="">Select staff member...</option>
                  {staffData?.map((staff: any) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.full_name}
                      {staff.department ? ` — ${staff.department}` : ''}
                    </option>
                  ))}
                </select>
                {errors.operator_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.operator_name[0]}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {paymentFlow === 'prepaid' ? 'Receipt Number' : 'Reference Number'}
              </label>
              <input
                type="text"
                value={formData.receipt_number || ''}
                onChange={e => handleInputChange('receipt_number', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder={paymentFlow === 'prepaid' ? 'RCP-12345' : 'REF-12345'}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Consumption Location *
              </label>
              <input
                type="text"
                value={formData.consumption_location || ''}
                onChange={e => handleInputChange('consumption_location', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.consumption_location ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="e.g., Shell Station - Main Street, Factory Premises"
                required
              />
              {errors.consumption_location && (
                <p className="mt-1 text-sm text-red-600">{errors.consumption_location[0]}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={3}
                value={formData.notes || ''}
                onChange={e => handleInputChange('notes', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Additional notes or comments..."
              />
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/expenses/resource-consumption')}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createConsumption.isPending || updateConsumption.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={20} />
            {createConsumption.isPending || updateConsumption.isPending
              ? 'Saving...'
              : isEditing
                ? 'Update Consumption'
                : 'Save Consumption'}
          </button>
        </div>
      </form>

      {/* Quick-create Resource modal */}
      {showResourceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Create Resource</h3>
              <button
                onClick={() => {
                  setShowResourceModal(false);
                  setResourceModalError(null);
                }}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto px-6 py-4 space-y-4">
              {resourceModalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                  <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{resourceModalError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Resource Name *
                </label>
                <input
                  type="text"
                  value={newResourceData.name}
                  onChange={e => setNewResourceData(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="e.g., Premium Diesel, Electricity – PHCN"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Resource Type *
                  </label>
                  <select
                    aria-label="Resource Type"
                    value={newResourceData.resource_type}
                    onChange={e =>
                      setNewResourceData(p => ({ ...p, resource_type: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="fuel">Fuel / Gasoline</option>
                    <option value="electricity">Electricity</option>
                    <option value="water">Water</option>
                    <option value="gas">Natural Gas</option>
                    <option value="telecom">Telecommunications</option>
                    <option value="service">Contracted Service</option>
                    <option value="consumable">Consumable Item</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit of Measure *
                  </label>
                  <input
                    type="text"
                    value={newResourceData.unit_of_measure}
                    onChange={e =>
                      setNewResourceData(p => ({ ...p, unit_of_measure: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="litres, kWh, m³, hrs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tracking Method
                  </label>
                  <select
                    aria-label="Tracking Method"
                    value={newResourceData.default_tracking_method}
                    onChange={e =>
                      setNewResourceData(p => ({ ...p, default_tracking_method: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="odometer">Odometer (km)</option>
                    <option value="hours">Engine / Service Hours</option>
                    <option value="meter">Meter Reading</option>
                    <option value="cycles">Cycles / Count</option>
                    <option value="quantity">Direct Quantity Only</option>
                    <option value="none">No Tracking</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Unit Cost
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newResourceData.default_unit_cost}
                    onChange={e =>
                      setNewResourceData(p => ({ ...p, default_unit_cost: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expense Category *
                </label>
                <select
                  aria-label="Expense Category"
                  value={newResourceData.expense_category || ''}
                  onChange={e =>
                    setNewResourceData(p => ({
                      ...p,
                      expense_category: Number(e.target.value) || undefined,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select expense category...</option>
                  {expenseCategoriesData?.results?.map((cat: any) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.code} – {cat.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Go to{' '}
                  <a
                    href="/expenses/resources/create"
                    target="_blank"
                    className="text-blue-600 underline"
                  >
                    Resources → Create
                  </a>{' '}
                  for advanced options (anomaly thresholds, contract details).
                </p>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowResourceModal(false);
                  setResourceModalError(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleQuickCreateResource}
                disabled={createResourceMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={16} />
                {createResourceMutation.isPending ? 'Creating...' : 'Create Resource'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceConsumptionFormPage;
