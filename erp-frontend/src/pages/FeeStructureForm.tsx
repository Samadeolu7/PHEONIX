import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  Settings,
  DollarSign,
  Calendar,
  Shield,
  Clock,
  Percent,
  AlertCircle,
  Info,
  Plus,
  CheckCircle,
  XCircle,
  Send,
  User,
  Trash2,
  Package,
} from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { IncomeCategory, FeeStructure } from '../services/incomeFeeStructureService';
import {
  useIncomeCategories,
  useIncomeFeeStructure,
  useCreateIncomeFeeStructure,
  useUpdateIncomeFeeStructure,
  useSubmitForApproval,
} from '../hooks/useIncomeFees';
import IncomeCategoryModal from '../components/modals/IncomeCategoryModal';
import { inventoryService } from '../services/inventoryService';

interface AccessRules {
  requires_minimum: boolean;
  minimum_percent: number;
  full_access_at_percent: number;
  grace_period_days: number;
  allowed_services: string[];
  restricted_services: string[];
}

interface FeeComponent {
  name: string;
  amount: number;
  description?: string;
  is_mandatory?: boolean;
}

interface PaymentTerms {
  due_days?: number;
  late_fee?: number;
  allows_partial?: boolean;
}

interface IncludedInventoryItem {
  inventory_item_id: number;
  quantity: number;
  name?: string;
  sku?: string;
}

interface InventoryItem {
  id: number;
  name: string;
  sku: string;
  unit_price: string;
  quantity_available: number;
}

interface FeeStructureFormData extends Omit<FeeStructure, 'industry_config'> {
  industry_config: {
    grade_level?: string;
    academic_year?: string;
    term?: string;
    department?: string;
    course_code?: string;
    semester?: string;
    is_mandatory?: boolean;
    custom_fields?: Record<string, string>;
    fee_components?: FeeComponent[];
    payment_terms?: PaymentTerms;
  };
  access_rules?: AccessRules;
  included_inventory_items?: IncludedInventoryItem[];
}

const FeeStructureForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const isEditing = Boolean(id);

  const { data: categoriesData, refetch: refetchCategories } = useIncomeCategories();
  const categories = categoriesData?.results ?? [];
  const { data: existingFeeStructure, isLoading: loadingData } = useIncomeFeeStructure(
    parseInt(id || '0'),
    isEditing
  );

  const createMutation = useCreateIncomeFeeStructure();
  const updateMutation = useUpdateIncomeFeeStructure();
  const submitForApprovalMutation = useSubmitForApproval();

  const [loading, setLoading] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [submittingForApproval, setSubmittingForApproval] = useState(false);

  // Income Category Modal state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const [formData, setFormData] = useState<FeeStructureFormData>({
    name: '',
    code: '',
    category: 0,
    base_amount: '',
    is_recurring: false,
    frequency: 'termly',
    industry_config: {
      academic_year: new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
      term: '1',
      is_mandatory: true,
      custom_fields: {},
      fee_components: [{ name: 'Tuition', amount: 0, description: '', is_mandatory: true }],
      payment_terms: {
        due_days: 30,
        late_fee: 0,
        allows_partial: true,
      },
    },
    access_rules: {
      requires_minimum: false,
      minimum_percent: 50,
      full_access_at_percent: 100,
      grace_period_days: 30,
      allowed_services: [],
      restricted_services: [],
    },
    included_inventory_items: [],
    is_active: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadInventoryItems();
  }, []);

  // Populate form when editing
  useEffect(() => {
    if (existingFeeStructure) {
      let industryConfig = existingFeeStructure.industry_config;
      if (typeof industryConfig === 'string') {
        try {
          industryConfig = JSON.parse(industryConfig);
        } catch {
          industryConfig = {};
        }
      }

      setFormData({
        ...existingFeeStructure,
        industry_config: {
          ...industryConfig,
          custom_fields: industryConfig.custom_fields || {},
          fee_components: industryConfig.fee_components || [
            { name: 'Tuition', amount: 0, description: '', is_mandatory: true },
          ],
          payment_terms: industryConfig.payment_terms || {
            due_days: 30,
            late_fee: 0,
            allows_partial: true,
          },
        },
        access_rules: existingFeeStructure.access_rules || {
          requires_minimum: false,
          minimum_percent: 50,
          full_access_at_percent: 100,
          grace_period_days: 30,
          allowed_services: [],
          restricted_services: [],
        },
        included_inventory_items: existingFeeStructure.included_inventory_items || [],
      });
    }
  }, [existingFeeStructure]);

  const loadInventoryItems = async () => {
    try {
      setLoadingInventory(true);
      const items = await inventoryService.getAllItems({ is_active: true });
      setInventoryItems(items);
    } catch (error) {
      console.error('Error loading inventory items:', error);
    } finally {
      setLoadingInventory(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Fee structure name is required';
    }

    if (!formData.code.trim()) {
      newErrors.code = 'Fee structure code is required';
    }

    if (!formData.category) {
      newErrors.category = 'Income category is required';
    }

    if (!formData.base_amount || parseFloat(formData.base_amount) <= 0) {
      newErrors.base_amount = 'Base amount must be greater than 0';
    }

    // Prevent activation without approval
    if (formData.is_active && formData.approval_status !== 'approved') {
      newErrors.is_active = 'Fee structure must be approved before activation';
      showError('Fee structures must be approved by Principal/Board before activation');
    }

    if (formData.access_rules?.requires_minimum) {
      if (
        formData.access_rules.minimum_percent < 0 ||
        formData.access_rules.minimum_percent > 100
      ) {
        newErrors.minimum_percent = 'Minimum percentage must be between 0 and 100';
      }
      if (formData.access_rules.full_access_at_percent < formData.access_rules.minimum_percent) {
        newErrors.full_access_at_percent =
          'Full access percentage must be greater than or equal to minimum percentage';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const components = formData.industry_config.fee_components || [];
      const totalFromComponents = components.reduce(
        (sum, comp) => sum + (Number(comp.amount) || 0),
        0
      );

      const submitData = {
        ...formData,
        base_amount:
          totalFromComponents > 0 ? totalFromComponents.toString() : formData.base_amount,
        industry_config: formData.industry_config,
      };

      let result;
      if (isEditing) {
        result = await updateMutation.mutateAsync({ id: parseInt(id!), data: submitData as any });
      } else {
        result = await createMutation.mutateAsync(submitData);
      }

      success(`Fee structure "${result.name}" ${isEditing ? 'updated' : 'created'} successfully`);
      navigate('/incomes/fee-structures');
    } catch (error: any) {
      console.error('Error saving fee structure:', error);
      showError(error.message || `Failed to ${isEditing ? 'update' : 'create'} fee structure`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!id) {
      showError('Please save the fee structure first');
      return;
    }

    try {
      setSubmittingForApproval(true);
      await submitForApprovalMutation.mutateAsync({
        id: parseInt(id),
        approval_notes: 'Submitted for Principal/Board approval',
      });
      success('Fee structure submitted for approval');
    } catch (error: any) {
      console.error('Error submitting for approval:', error);
      showError(error.message || 'Failed to submit for approval');
    } finally {
      setSubmittingForApproval(false);
    }
  };

  const handleActivate = async () => {
    if (!id) {
      showError('Invalid fee structure');
      return;
    }

    if (formData.approval_status !== 'approved') {
      showError('Fee structure must be approved before activation');
      return;
    }

    try {
      setLoading(true);
      const updatedData = {
        ...formData,
        is_active: true,
      };

      await updateMutation.mutateAsync({ id: parseInt(id), data: updatedData as any });
      success('Fee structure activated successfully');
    } catch (error: any) {
      console.error('Error activating fee structure:', error);
      showError(error.message || 'Failed to activate fee structure');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof FeeStructureFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  const handleIndustryConfigChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      industry_config: {
        ...prev.industry_config,
        [field]: value,
      },
    }));
  };

  const handleCustomFieldChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      industry_config: {
        ...prev.industry_config,
        custom_fields: {
          ...prev.industry_config.custom_fields,
          [key]: value,
        },
      },
    }));
  };

  const handleAccessRulesChange = (field: keyof AccessRules, value: any) => {
    setFormData(prev => ({
      ...prev,
      access_rules: {
        ...prev.access_rules!,
        [field]: value,
      },
    }));
  };

  const addCustomField = () => {
    const key = prompt('Enter field name:');
    if (key && key.trim()) {
      handleCustomFieldChange(key.trim(), '');
    }
  };

  const removeCustomField = (key: string) => {
    setFormData(prev => {
      const newCustomFields = { ...prev.industry_config.custom_fields };
      delete newCustomFields[key];
      return {
        ...prev,
        industry_config: {
          ...prev.industry_config,
          custom_fields: newCustomFields,
        },
      };
    });
  };

  // Fee Components Management
  const addFeeComponent = () => {
    setFormData(prev => ({
      ...prev,
      industry_config: {
        ...prev.industry_config,
        fee_components: [
          ...(prev.industry_config.fee_components || []),
          { name: '', amount: 0, description: '', is_mandatory: true },
        ],
      },
    }));
  };

  const removeFeeComponent = (index: number) => {
    setFormData(prev => ({
      ...prev,
      industry_config: {
        ...prev.industry_config,
        fee_components: prev.industry_config.fee_components?.filter((_, i) => i !== index) || [],
      },
    }));
  };

  const updateFeeComponent = (index: number, field: keyof FeeComponent, value: any) => {
    setFormData(prev => ({
      ...prev,
      industry_config: {
        ...prev.industry_config,
        fee_components:
          prev.industry_config.fee_components?.map((comp, i) =>
            i === index ? { ...comp, [field]: value } : comp
          ) || [],
      },
    }));
  };

  const updatePaymentTerms = (field: keyof PaymentTerms, value: any) => {
    setFormData(prev => ({
      ...prev,
      industry_config: {
        ...prev.industry_config,
        payment_terms: {
          ...(prev.industry_config.payment_terms || {}),
          [field]: value,
        },
      },
    }));
  };

  // Calculate total amount from components
  const calculateTotalAmount = () => {
    const components = formData.industry_config.fee_components || [];
    return components.reduce((sum, comp) => sum + (Number(comp.amount) || 0), 0).toFixed(2);
  };

  // Included Inventory Items Management
  const addIncludedInventoryItem = () => {
    setFormData(prev => ({
      ...prev,
      included_inventory_items: [
        ...(prev.included_inventory_items || []),
        { inventory_item_id: 0, quantity: 1, name: '', sku: '' },
      ],
    }));
  };

  const removeIncludedInventoryItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      included_inventory_items: prev.included_inventory_items?.filter((_, i) => i !== index) || [],
    }));
  };

  const updateIncludedInventoryItem = (
    index: number,
    field: keyof IncludedInventoryItem,
    value: any
  ) => {
    setFormData(prev => {
      const newItems = [...(prev.included_inventory_items || [])];
      newItems[index] = { ...newItems[index], [field]: value };

      // Auto-populate name and sku when inventory item is selected
      if (field === 'inventory_item_id' && value) {
        const selectedItem = inventoryItems.find(item => item.id === parseInt(value));
        if (selectedItem) {
          newItems[index].name = selectedItem.name;
          newItems[index].sku = selectedItem.sku;
        }
      }

      return {
        ...prev,
        included_inventory_items: newItems,
      };
    });
  };

  const handleCategoryModalSuccess = (category: IncomeCategory) => {
    refetchCategories();
    handleInputChange('category', category.id);
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/incomes/fee-structures')}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <Settings className="w-8 h-8 text-blue-600 mr-3" />
                {isEditing ? 'Edit Fee Structure' : 'Create Fee Structure'}
              </h1>
              <p className="text-gray-600">
                {isEditing
                  ? 'Update fee structure details and configuration'
                  : 'Set up a new fee structure with industry-specific options'}
              </p>
            </div>
          </div>
          {isEditing && formData.approval_status && (
            <div className="flex items-center space-x-3">
              {formData.approval_status === 'draft' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                  <Clock className="h-4 w-4 mr-1" />
                  Draft
                </span>
              )}
              {formData.approval_status === 'pending_approval' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                  <Clock className="h-4 w-4 mr-1" />
                  Pending Approval
                </span>
              )}
              {formData.approval_status === 'approved' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approved
                </span>
              )}
              {formData.approval_status === 'rejected' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                  <XCircle className="h-4 w-4 mr-1" />
                  Rejected
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Approval Info Banner */}
      {isEditing && formData.approval_status && formData.approval_status !== 'draft' && (
        <div className="max-w-4xl mx-auto px-6 pt-6">
          <div
            className={`rounded-lg p-4 ${
              formData.approval_status === 'approved'
                ? 'bg-green-50 border border-green-200'
                : formData.approval_status === 'rejected'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-yellow-50 border border-yellow-200'
            }`}
          >
            <div className="flex items-start">
              {formData.approval_status === 'approved' && (
                <CheckCircle className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
              )}
              {formData.approval_status === 'rejected' && (
                <XCircle className="h-5 w-5 text-red-600 mr-3 mt-0.5" />
              )}
              {formData.approval_status === 'pending_approval' && (
                <Clock className="h-5 w-5 text-yellow-600 mr-3 mt-0.5" />
              )}
              <div className="flex-1">
                <h4
                  className={`text-sm font-semibold mb-1 ${
                    formData.approval_status === 'approved'
                      ? 'text-green-900'
                      : formData.approval_status === 'rejected'
                        ? 'text-red-900'
                        : 'text-yellow-900'
                  }`}
                >
                  {formData.approval_status === 'approved' && 'Approved'}
                  {formData.approval_status === 'rejected' && 'Rejected'}
                  {formData.approval_status === 'pending_approval' && 'Pending Approval'}
                </h4>
                {formData.approved_by_name && (
                  <p className="text-sm text-gray-700 flex items-center mb-1">
                    <User className="h-4 w-4 mr-1" />
                    {formData.approval_status === 'approved'
                      ? 'Approved by'
                      : formData.approval_status === 'rejected'
                        ? 'Rejected by'
                        : 'Reviewed by'}
                    : {formData.approved_by_name}
                    {formData.approved_at &&
                      ` on ${new Date(formData.approved_at).toLocaleString('en-GB')}`}
                  </p>
                )}
                {formData.approval_notes && (
                  <p className="text-sm text-gray-600 mt-2">
                    <strong>Notes:</strong> {formData.approval_notes}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
              <DollarSign className="w-5 h-5 text-green-600 mr-2" />
              Basic Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fee Structure Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => handleInputChange('name', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="e.g., Grade 10 - Term 2 Fees"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fee Structure Code *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={e => handleInputChange('code', e.target.value.toUpperCase())}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.code ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="e.g., G10-T2"
                />
                {errors.code && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors.code}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Income Category *
                </label>
                <div className="flex space-x-2">
                  <select
                    value={formData.category}
                    onChange={e => handleInputChange('category', parseInt(e.target.value))}
                    className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.category ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value={0}>Select a category</option>
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name} ({category.code})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center"
                    title="Create new income category"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {errors.category && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors.category}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Base Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.base_amount}
                  onChange={e => handleInputChange('base_amount', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.base_amount ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                />
                {errors.base_amount && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors.base_amount}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Or use fee components below to auto-calculate
                </p>
              </div>
            </div>
          </div>

          {/* Fee Components Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <DollarSign className="w-5 h-5 text-green-600 mr-2" />
                Fee Components
              </h2>
              <button
                type="button"
                onClick={addFeeComponent}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center text-sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Component
              </button>
            </div>

            <div className="space-y-4">
              {formData.industry_config.fee_components?.map((component, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Component Name
                      </label>
                      <input
                        type="text"
                        value={component.name}
                        onChange={e => updateFeeComponent(index, 'name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Tuition"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={component.amount}
                        onChange={e =>
                          updateFeeComponent(index, 'amount', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>

                    <div className="md:col-span-5">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Description
                      </label>
                      <input
                        type="text"
                        value={component.description || ''}
                        onChange={e => updateFeeComponent(index, 'description', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Term 1 tuition fees"
                      />
                    </div>

                    <div className="md:col-span-1 flex items-end">
                      <div className="flex items-center mb-2">
                        <input
                          type="checkbox"
                          id={`mandatory-${index}`}
                          checked={component.is_mandatory !== false}
                          onChange={e =>
                            updateFeeComponent(index, 'is_mandatory', e.target.checked)
                          }
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label
                          htmlFor={`mandatory-${index}`}
                          className="ml-2 text-sm text-gray-700"
                        >
                          Required
                        </label>
                      </div>
                    </div>

                    <div className="md:col-span-1 flex items-end justify-end">
                      {formData.industry_config.fee_components &&
                        formData.industry_config.fee_components.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeFeeComponent(index)}
                            className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md"
                            title="Remove component"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              ))}

              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-900">
                    Total Amount from Components:
                  </span>
                  <span className="text-lg font-bold text-blue-900">{calculateTotalAmount()}</span>
                </div>
                <p className="text-xs text-blue-700 mt-2">
                  This total will be used as the base_amount if components are defined
                </p>
              </div>
            </div>
          </div>

          {/* Payment Terms Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
              <Calendar className="w-5 h-5 text-purple-600 mr-2" />
              Payment Terms
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Due Days</label>
                <input
                  type="number"
                  min="0"
                  value={formData.industry_config.payment_terms?.due_days || 30}
                  onChange={e => updatePaymentTerms('due_days', parseInt(e.target.value) || 30)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="30"
                />
                <p className="mt-1 text-xs text-gray-500">Number of days until payment is due</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Late Fee (Optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.industry_config.payment_terms?.late_fee || 0}
                  onChange={e => updatePaymentTerms('late_fee', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
                <p className="mt-1 text-xs text-gray-500">Penalty for late payment</p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="allows_partial"
                  checked={formData.industry_config.payment_terms?.allows_partial !== false}
                  onChange={e => updatePaymentTerms('allows_partial', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="allows_partial" className="ml-2 block text-sm text-gray-900">
                  Allow partial payments
                </label>
              </div>
            </div>
          </div>

          {/* Included Inventory Items Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Package className="w-5 h-5 text-orange-600 mr-2" />
                  Included Inventory Items
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Physical items bundled with this fee structure (e.g., uniforms, books, supplies)
                </p>
              </div>
              <button
                type="button"
                onClick={addIncludedInventoryItem}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 flex items-center text-sm"
                disabled={loadingInventory}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </button>
            </div>

            {formData.included_inventory_items && formData.included_inventory_items.length > 0 ? (
              <div className="space-y-4">
                {formData.included_inventory_items.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Inventory Item <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={item.inventory_item_id}
                          onChange={e =>
                            updateIncludedInventoryItem(
                              index,
                              'inventory_item_id',
                              parseInt(e.target.value)
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          disabled={loadingInventory}
                        >
                          <option value={0}>Select inventory item...</option>
                          {inventoryItems.map(invItem => (
                            <option key={invItem.id} value={invItem.id}>
                              {invItem.name} ({invItem.sku}) - ${invItem.unit_price} - Available:{' '}
                              {invItem.quantity_available}
                            </option>
                          ))}
                        </select>
                        {item.name && (
                          <p className="mt-1 text-xs text-gray-500">
                            Selected: {item.name} ({item.sku})
                          </p>
                        )}
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Quantity <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantity}
                          onChange={e =>
                            updateIncludedInventoryItem(
                              index,
                              'quantity',
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="1"
                        />
                      </div>

                      <div className="md:col-span-3 flex items-end">
                        <div className="text-sm text-gray-600">
                          {item.inventory_item_id > 0 && (
                            <div className="space-y-1">
                              <p>
                                <span className="font-medium">Item:</span> {item.name || 'N/A'}
                              </p>
                              <p>
                                <span className="font-medium">SKU:</span> {item.sku || 'N/A'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="md:col-span-1 flex items-end justify-end">
                        <button
                          type="button"
                          onClick={() => removeIncludedInventoryItem(index)}
                          className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md"
                          title="Remove item"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
                  <div className="flex items-start">
                    <Info className="w-5 h-5 text-orange-600 mr-2 mt-0.5" />
                    <div className="text-sm text-orange-800">
                      <p className="font-medium mb-1">How it works:</p>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li>
                          These items will automatically be added to invoices created from this fee
                          structure
                        </li>
                        <li>Stock will be reserved when the invoice is created</li>
                        <li>Stock will be deducted when the invoice is paid</li>
                        <li>
                          Students/clients will receive both the service and the physical items
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-sm">No inventory items included yet</p>
                <p className="text-xs mt-1">
                  Add items like uniforms, books, or supplies that come with this fee
                </p>
              </div>
            )}
          </div>

          {/* Recurring Billing Settings */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
              <Calendar className="w-5 h-5 text-purple-600 mr-2" />
              Recurring Billing Settings
            </h2>

            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_recurring"
                  checked={formData.is_recurring}
                  onChange={e => handleInputChange('is_recurring', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="is_recurring" className="ml-2 block text-sm text-gray-900">
                  Enable recurring billing for this fee structure
                </label>
              </div>

              {formData.is_recurring && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Billing Frequency
                  </label>
                  <select
                    value={formData.frequency}
                    onChange={e => handleInputChange('frequency', e.target.value as any)}
                    className="w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="termly">Termly</option>
                    <option value="annually">Annually</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Industry-Specific Configuration */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
              <Settings className="w-5 h-5 text-orange-600 mr-2" />
              Industry-Specific Configuration
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Academic Year
                </label>
                <input
                  type="text"
                  value={formData.industry_config.academic_year || ''}
                  onChange={e => handleIndustryConfigChange('academic_year', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 2024-2025"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Term/Semester
                </label>
                <input
                  type="text"
                  value={formData.industry_config.term || ''}
                  onChange={e => handleIndustryConfigChange('term', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 1, 2, 3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Grade Level</label>
                <input
                  type="text"
                  value={formData.industry_config.grade_level || ''}
                  onChange={e => handleIndustryConfigChange('grade_level', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 10, Primary 1, JSS 2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                <input
                  type="text"
                  value={formData.industry_config.department || ''}
                  onChange={e => handleIndustryConfigChange('department', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Science, Arts, Commercial"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_mandatory"
                  checked={formData.industry_config.is_mandatory !== false}
                  onChange={e => handleIndustryConfigChange('is_mandatory', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="is_mandatory" className="ml-2 block text-sm text-gray-900">
                  This is a mandatory fee
                </label>
              </div>
            </div>

            {/* Custom Fields */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-medium text-gray-900">Custom Fields</h3>
                <button
                  type="button"
                  onClick={addCustomField}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Add Field
                </button>
              </div>

              {Object.entries(formData.industry_config.custom_fields || {}).map(([key, value]) => (
                <div key={key} className="flex items-center space-x-2 mb-2">
                  <input
                    type="text"
                    value={key}
                    readOnly
                    className="w-1/3 px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                  />
                  <input
                    type="text"
                    value={value}
                    onChange={e => handleCustomFieldChange(key, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Field value"
                  />
                  <button
                    type="button"
                    onClick={() => removeCustomField(key)}
                    className="px-2 py-2 text-red-600 hover:text-red-800"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Access Rules Configuration */}

          {/* <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
              <Shield className="w-5 h-5 text-red-600 mr-2" />
              Access Control Rules
            </h2>
            
            <div className="space-y-6">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requires_minimum"
                  checked={formData.access_rules?.requires_minimum || false}
                  onChange={(e) => handleAccessRulesChange('requires_minimum', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="requires_minimum" className="ml-2 block text-sm text-gray-900">
                  Require minimum payment for service access
                </label>
              </div>

              {formData.access_rules?.requires_minimum && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pl-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Minimum Payment Percentage
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={formData.access_rules?.minimum_percent || 50}
                        onChange={(e) => handleAccessRulesChange('minimum_percent', parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium text-gray-900 w-12">
                        {formData.access_rules?.minimum_percent || 50}%
                      </span>
                    </div>
                    {errors.minimum_percent && (
                      <p className="mt-1 text-sm text-red-600">{errors.minimum_percent}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Access Percentage
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={formData.access_rules?.full_access_at_percent || 100}
                        onChange={(e) => handleAccessRulesChange('full_access_at_percent', parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium text-gray-900 w-12">
                        {formData.access_rules?.full_access_at_percent || 100}%
                      </span>
                    </div>
                    {errors.full_access_at_percent && (
                      <p className="mt-1 text-sm text-red-600">{errors.full_access_at_percent}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Grace Period (Days)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.access_rules?.grace_period_days || 30}
                      onChange={(e) => handleAccessRulesChange('grace_period_days', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex">
                  <Info className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">Access Control Information</p>
                    <p className="mt-1">
                      When enabled, students/clients will need to meet minimum payment requirements to access services. 
                      Full access is granted when they reach the specified payment percentage.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div> */}

          {/* Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Status</h2>

            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={e => handleInputChange('is_active', e.target.checked)}
                  disabled={isEditing && formData.approval_status !== 'approved'}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                  Fee structure is active and available for use
                </label>
              </div>

              {isEditing && formData.approval_status !== 'approved' && formData.is_active && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mr-2 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      <p className="font-medium">Activation Blocked</p>
                      <p className="mt-1">
                        Fee structures must be approved by Principal/Board before activation.
                        Current status:{' '}
                        <strong>
                          {formData.approval_status === 'draft'
                            ? 'Draft'
                            : formData.approval_status === 'pending_approval'
                              ? 'Pending Approval'
                              : 'Rejected'}
                        </strong>
                      </p>
                      <p className="mt-1">
                        Please submit for approval first, then activate after approval.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!isEditing && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <div className="flex items-start">
                    <Info className="h-5 w-5 text-blue-600 mr-2 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium">Approval Required</p>
                      <p className="mt-1">
                        New fee structures start as <strong>Draft</strong> and must be approved
                        before activation. After saving, submit for Principal/Board approval.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isEditing && formData.approval_status === 'approved' && !formData.is_active && (
                <div className="bg-green-50 border border-green-200 rounded-md p-3">
                  <div className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-600 mr-2 mt-0.5" />
                    <div className="text-sm text-green-800">
                      <p className="font-medium">Ready to Activate</p>
                      <p className="mt-1">
                        This fee structure has been approved and can now be activated. Check the box
                        above to make it active and available for use.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-between space-x-4">
            <div className="flex items-center space-x-3">
              {isEditing && formData.approval_status === 'draft' && (
                <button
                  type="button"
                  onClick={handleSubmitForApproval}
                  disabled={submittingForApproval}
                  className="px-6 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {submittingForApproval ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit for Approval
                    </>
                  )}
                </button>
              )}

              {isEditing && formData.approval_status === 'approved' && !formData.is_active && (
                <button
                  type="button"
                  onClick={handleActivate}
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      Activating...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Activate Fee Structure
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => navigate('/incomes/fee-structures')}
                className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || (isEditing && formData.approval_status === 'approved')}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                <Save className="w-4 h-4 mr-2" />
                {loading
                  ? 'Saving...'
                  : isEditing
                    ? 'Update Fee Structure'
                    : 'Create Fee Structure'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Income Category Modal */}
      <IncomeCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSuccess={handleCategoryModalSuccess}
        editCategory={null}
      />
    </div>
  );
};

export default FeeStructureForm;
