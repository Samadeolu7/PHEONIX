import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, AlertTriangle, Plus, X } from 'lucide-react';
import { useCreateResource, useUpdateResource, useResource } from '../../hooks/useResources';
import { useAllSuppliers } from '../../hooks/useSuppliers';
import { useExpenseCategories, useCreateExpenseCategory } from '../../hooks/useExpenseCategories';
import { useExpenseAccounts } from '../../hooks/useAccountsSimple';
import { CreateResourceData } from '../../types/resources';

type ValidationError = Record<string, string[]>;

const ResourceFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  const [formData, setFormData] = useState<Partial<CreateResourceData>>({
    resource_type: 'fuel',
    is_active: true,
    is_service: false,
    enable_irregularity_detection: true,
  });
  const [errors, setErrors] = useState<ValidationError>({});

  // Modal state for creating expense categories
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryData, setNewCategoryData] = useState({
    name: '',
    code: '',
    description: '',
    expense_account: undefined as number | undefined,
    requires_approval: false,
  });
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Queries
  const { data: existingResource } = useResource(Number(id), isEditing);
  const { data: suppliersData = [] } = useAllSuppliers({ is_active: true });
  const { data: expenseCategoriesData, refetch: refetchCategories } = useExpenseCategories();
  const { data: expenseAccountsData } = useExpenseAccounts();

  // Mutations
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const createCategory = useCreateExpenseCategory();

  // Load existing data for editing
  useEffect(() => {
    if (existingResource && isEditing) {
      setFormData({
        resource_code: existingResource.resource_code,
        name: existingResource.name,
        description: existingResource.description,
        resource_type: existingResource.resource_type,
        unit_of_measure: existingResource.unit_of_measure,
        default_tracking_method: existingResource.default_tracking_method,
        default_unit_cost: existingResource.default_unit_cost,
        default_supplier: existingResource.default_supplier,
        expense_category: existingResource.expense_category,
        is_service: existingResource.is_service,
        service_contract_number: existingResource.service_contract_number,
        service_frequency: existingResource.service_frequency,
        enable_irregularity_detection: existingResource.enable_irregularity_detection,
        variance_threshold_percentage: existingResource.variance_threshold_percentage,
        min_efficiency: existingResource.min_efficiency,
        max_efficiency: existingResource.max_efficiency,
        max_daily_usage: existingResource.max_daily_usage,
        is_active: existingResource.is_active,
        metadata: existingResource.metadata,
      });
    }
  }, [existingResource, isEditing]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    // Clear field-specific errors
    if (errors[field]) {
      setErrors((prev: ValidationError) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: ValidationError = {};

    // Required field validations (resource_code is optional - backend auto-generates if not provided)
    if (!formData.name) newErrors.name = ['Resource name is required'];
    if (!formData.resource_type) newErrors.resource_type = ['Resource type is required'];
    if (!formData.unit_of_measure) newErrors.unit_of_measure = ['Unit of measure is required'];
    if (!formData.expense_category) newErrors.expense_category = ['Expense category is required'];

    // Service-specific validations
    if (formData.is_service) {
      if (!formData.service_contract_number) {
        newErrors.service_contract_number = ['Contract number is required for services'];
      }
      if (!formData.service_frequency) {
        newErrors.service_frequency = ['Service frequency is required for services'];
      }
    }

    // Efficiency validations
    if (formData.min_efficiency && formData.max_efficiency) {
      const min = parseFloat(formData.min_efficiency);
      const max = parseFloat(formData.max_efficiency);
      if (min >= max) {
        newErrors.max_efficiency = ['Maximum efficiency must be greater than minimum efficiency'];
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      if (isEditing) {
        await updateResource.mutateAsync({
          id: Number(id),
          data: formData,
        });
        alert('Resource updated successfully');
      } else {
        const result = await createResource.mutateAsync(formData as CreateResourceData);
        alert(`Resource ${result.name} created successfully`);
      }
      navigate('/expenses/resources');
    } catch (error: any) {
      if (error.response?.data) {
        setErrors(error.response.data);
      } else {
        alert('Failed to save resource');
      }
    }
  };

  const handleCreateCategory = async () => {
    setCategoryError(null);

    if (!newCategoryData.name.trim()) {
      setCategoryError('Category name is required');
      return;
    }

    if (!newCategoryData.code.trim()) {
      setCategoryError('Category code is required');
      return;
    }

    if (!newCategoryData.expense_account) {
      setCategoryError('Expense account is required');
      return;
    }

    try {
      const newCategory = await createCategory.mutateAsync({
        name: newCategoryData.name,
        code: newCategoryData.code,
        description: newCategoryData.description,
        expense_account: newCategoryData.expense_account,
        requires_approval: newCategoryData.requires_approval,
      });

      // Refresh categories list
      await refetchCategories();

      // Set the new category as selected
      handleInputChange('expense_category', newCategory.id);

      // Close modal and reset form
      setShowCategoryModal(false);
      setNewCategoryData({
        name: '',
        code: '',
        description: '',
        expense_account: undefined,
        requires_approval: false,
      });

      alert('Expense category created successfully');
    } catch (error: any) {
      setCategoryError(
        error.response?.data?.message || error.message || 'Failed to create expense category'
      );
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/expenses/resources')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={20} />
          Back to Resources
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditing ? 'Edit' : 'Create'} Resource
          </h1>
          <p className="text-gray-600">
            {isEditing ? 'Update resource details' : 'Add a new consumable resource to the system'}
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
                Resource Code{' '}
                <span className="text-gray-400 text-xs">(optional - auto-generated)</span>
              </label>
              <input
                type="text"
                value={formData.resource_code || ''}
                onChange={e => handleInputChange('resource_code', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.resource_code ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="e.g., FUEL-PREM-0001 (leave blank to auto-generate)"
              />
              {errors.resource_code && (
                <p className="mt-1 text-sm text-red-600">{errors.resource_code[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resource Name *
              </label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={e => handleInputChange('name', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.name ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="e.g., Premium Gasoline, Cleaning Service"
                required
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name[0]}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={3}
                value={formData.description || ''}
                onChange={e => handleInputChange('description', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Optional description of the resource..."
              />
            </div>
          </div>
        </div>

        {/* Resource Type & Measurement */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Type & Measurement</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resource Type *
              </label>
              <select
                value={formData.resource_type || ''}
                onChange={e => handleInputChange('resource_type', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 ${
                  errors.resource_type ? 'border-red-300' : 'border-gray-300'
                }`}
                required
              >
                <option value="">Select type...</option>
                <option value="fuel">Fuel/Gasoline</option>
                <option value="electricity">Electricity</option>
                <option value="water">Water</option>
                <option value="gas">Natural Gas</option>
                <option value="telecom">Telecommunications</option>
                <option value="service">Contracted Service</option>
                <option value="consumable">Consumable Item</option>
                <option value="other">Other Resource</option>
              </select>
              {errors.resource_type && (
                <p className="mt-1 text-sm text-red-600">{errors.resource_type[0]}</p>
              )}
            </div>

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
                placeholder="e.g., liters, kWh, m³, hours, pieces"
                required
              />
              {errors.unit_of_measure && (
                <p className="mt-1 text-sm text-red-600">{errors.unit_of_measure[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tracking Method
              </label>
              <select
                value={formData.default_tracking_method || ''}
                onChange={e =>
                  handleInputChange('default_tracking_method', e.target.value || undefined)
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">Select method...</option>
                <option value="odometer">Odometer Reading (km/miles)</option>
                <option value="meter">Meter Reading (kWh, m³, etc.)</option>
                <option value="hours">Runtime/Service Hours</option>
                <option value="cycles">Operating Cycles/Count</option>
                <option value="quantity">Direct Quantity Only</option>
                <option value="none">No Usage Tracking</option>
              </select>
            </div>
          </div>
        </div>

        {/* Cost & Supplier */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Cost & Supplier</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Unit Cost
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.default_unit_cost || ''}
                onChange={e => handleInputChange('default_unit_cost', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="0.00"
              />
              <p className="mt-1 text-xs text-gray-500">Can be overridden per consumption</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Supplier
              </label>
              <select
                value={formData.default_supplier || ''}
                onChange={e =>
                  handleInputChange('default_supplier', Number(e.target.value) || undefined)
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">Select supplier...</option>
                {suppliersData?.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expense Category *
              </label>
              <div className="flex gap-2">
                <select
                  value={formData.expense_category || ''}
                  onChange={e =>
                    handleInputChange('expense_category', Number(e.target.value) || undefined)
                  }
                  className={`flex-1 border rounded-md px-3 py-2 ${
                    errors.expense_category ? 'border-red-300' : 'border-gray-300'
                  }`}
                  required
                >
                  <option value="">Select expense category...</option>
                  {expenseCategoriesData?.results?.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.code} - {category.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2 shadow-sm border border-green-700 focus:outline-none focus:ring-2 focus:ring-green-300"
                  title="Create new expense category"
                  aria-label="Create new expense category"
                  data-testid="open-create-expense-category-modal"
                >
                  <Plus size={18} />
                  <span className="hidden sm:inline">New</span>
                </button>
              </div>
              {errors.expense_category && (
                <p className="mt-1 text-sm text-red-600">{errors.expense_category[0]}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">Expense category for accounting</p>
            </div>
          </div>
        </div>

        {/* Service Configuration */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Service Configuration</h2>
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_service"
                checked={formData.is_service || false}
                onChange={e => handleInputChange('is_service', e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              <label htmlFor="is_service" className="ml-2 text-sm text-gray-700">
                This is a contracted service (cleaners, security, etc.)
              </label>
            </div>

            {formData.is_service && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contract Number *
                  </label>
                  <input
                    type="text"
                    value={formData.service_contract_number || ''}
                    onChange={e => handleInputChange('service_contract_number', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 ${
                      errors.service_contract_number ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Contract reference number"
                    required={formData.is_service}
                  />
                  {errors.service_contract_number && (
                    <p className="mt-1 text-sm text-red-600">{errors.service_contract_number[0]}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Service Frequency *
                  </label>
                  <input
                    type="text"
                    value={formData.service_frequency || ''}
                    onChange={e => handleInputChange('service_frequency', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 ${
                      errors.service_frequency ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="e.g., daily, weekly, monthly"
                    required={formData.is_service}
                  />
                  {errors.service_frequency && (
                    <p className="mt-1 text-sm text-red-600">{errors.service_frequency[0]}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Irregularity Detection */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Irregularity Detection</h2>
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="enable_irregularity_detection"
                checked={formData.enable_irregularity_detection || false}
                onChange={e => handleInputChange('enable_irregularity_detection', e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              <label htmlFor="enable_irregularity_detection" className="ml-2 text-sm text-gray-700">
                Enable automatic irregularity detection
              </label>
            </div>

            {formData.enable_irregularity_detection && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Variance Threshold (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.variance_threshold_percentage || ''}
                    onChange={e =>
                      handleInputChange('variance_threshold_percentage', e.target.value)
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="20.00"
                  />
                  <p className="mt-1 text-xs text-gray-500">Variance % to flag as irregular</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Daily Usage
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.max_daily_usage || ''}
                    onChange={e => handleInputChange('max_daily_usage', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="500.00"
                  />
                  <p className="mt-1 text-xs text-gray-500">Maximum acceptable daily usage</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Efficiency
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.min_efficiency || ''}
                    onChange={e => handleInputChange('min_efficiency', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="2.00"
                  />
                  <p className="mt-1 text-xs text-gray-500">e.g., 2 km/liter</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Efficiency
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.max_efficiency || ''}
                    onChange={e => handleInputChange('max_efficiency', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 ${
                      errors.max_efficiency ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="30.00"
                  />
                  {errors.max_efficiency && (
                    <p className="mt-1 text-sm text-red-600">{errors.max_efficiency[0]}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">e.g., 30 km/liter</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Status</h2>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active || false}
              onChange={e => handleInputChange('is_active', e.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
              Resource is currently available for consumption
            </label>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/expenses/resources')}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createResource.isPending || updateResource.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={20} />
            {createResource.isPending || updateResource.isPending
              ? 'Saving...'
              : isEditing
                ? 'Update Resource'
                : 'Create Resource'}
          </button>
        </div>
      </form>

      {/* Create Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create Expense Category</h3>
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setNewCategoryData({
                    name: '',
                    code: '',
                    description: '',
                    expense_account: undefined,
                    requires_approval: false,
                  });
                  setCategoryError(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            {categoryError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600">{categoryError}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  value={newCategoryData.name}
                  onChange={e => setNewCategoryData({ ...newCategoryData, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="e.g., Fuel & Transportation"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Code *
                </label>
                <input
                  type="text"
                  value={newCategoryData.code}
                  onChange={e => setNewCategoryData({ ...newCategoryData, code: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="e.g., EXP-FUEL"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expense Account *
                </label>
                <select
                  value={newCategoryData.expense_account || ''}
                  onChange={e =>
                    setNewCategoryData({
                      ...newCategoryData,
                      expense_account: Number(e.target.value),
                    })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select expense account...</option>
                  {expenseAccountsData?.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={newCategoryData.description}
                  onChange={e =>
                    setNewCategoryData({ ...newCategoryData, description: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Optional description..."
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requires_approval"
                  checked={newCategoryData.requires_approval}
                  onChange={e =>
                    setNewCategoryData({ ...newCategoryData, requires_approval: e.target.checked })
                  }
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="requires_approval" className="ml-2 text-sm text-gray-700">
                  Requires approval before expense posting
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowCategoryModal(false);
                  setNewCategoryData({
                    name: '',
                    code: '',
                    description: '',
                    expense_account: undefined,
                    requires_approval: false,
                  });
                  setCategoryError(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={createCategory.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Save size={16} />
                {createCategory.isPending ? 'Creating...' : 'Create Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceFormPage;
