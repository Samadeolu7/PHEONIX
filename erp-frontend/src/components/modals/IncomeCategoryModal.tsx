import React, { useState, useEffect } from 'react';
import { X, Save, DollarSign, AlertCircle } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import {
  incomeCategoryService,
  IncomeCategory,
  IncomeAccount,
} from '../../services/incomeCategoryService';

interface IncomeCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (category: IncomeCategory) => void;
  editCategory?: IncomeCategory | null;
}

const IncomeCategoryModal: React.FC<IncomeCategoryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editCategory,
}) => {
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [incomeAccounts, setIncomeAccounts] = useState<IncomeAccount[]>([]);
  const [parentCategories, setParentCategories] = useState<IncomeCategory[]>([]);

  const [formData, setFormData] = useState<
    Omit<IncomeCategory, 'id' | 'created_at' | 'updated_at'>
  >({
    name: '',
    code: '',
    description: '',
    income_account: 0,
    behavior_config: {},
    parent_category: null,
    is_active: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      loadIncomeAccounts();
      loadParentCategories();

      if (editCategory) {
        setFormData({
          name: editCategory.name,
          code: editCategory.code,
          description: editCategory.description || '',
          income_account: editCategory.income_account,
          behavior_config: editCategory.behavior_config || {},
          parent_category: editCategory.parent_category,
          is_active: editCategory.is_active ?? true,
        });
      } else {
        // Reset form for new category
        setFormData({
          name: '',
          code: '',
          description: '',
          income_account: 0,
          behavior_config: {},
          parent_category: null,
          is_active: true,
        });
      }
      setErrors({});
    }
  }, [isOpen, editCategory]);

  const loadIncomeAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const response = await incomeCategoryService.getIncomeAccounts();

      // Normalize response - could be direct array or wrapped in results
      const accountsArray = Array.isArray(response) ? response : (response as any)?.results || [];

      // Filter for CHILD accounts only (accounts that can post transactions)
      const postableAccounts = accountsArray.filter(
        (acc: any) => acc.account_level === 'CHILD' || acc.can_post_transactions === true
      );

      console.log('📊 Loaded income accounts:', {
        total: accountsArray.length,
        postable: postableAccounts.length,
      });
      setIncomeAccounts(postableAccounts);
    } catch (error) {
      console.error('Error loading income accounts:', error);
      showError('Failed to load income accounts');
      setIncomeAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const loadParentCategories = async () => {
    try {
      const response = await incomeCategoryService.getIncomeCategories();

      // Normalize response - could be direct array or wrapped in results
      const categoriesArray = Array.isArray(response) ? response : (response as any)?.results || [];

      // Filter out the current category if editing to prevent circular reference
      const categories = editCategory
        ? categoriesArray.filter(cat => cat.id !== editCategory.id)
        : categoriesArray;

      console.log('📁 Loaded parent categories:', categories.length);
      setParentCategories(categories || []);
    } catch (error) {
      console.error('Error loading parent categories:', error);
      setParentCategories([]);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Category name is required';
    }

    if (!formData.code.trim()) {
      newErrors.code = 'Category code is required';
    } else if (formData.code.length > 20) {
      newErrors.code = 'Category code must be 20 characters or less';
    }

    if (!formData.income_account) {
      newErrors.income_account = 'Income account is required';
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
      let result: IncomeCategory;

      if (editCategory) {
        result = await incomeCategoryService.updateIncomeCategory(editCategory.id!, formData);
        success(`Income category "${result.name}" updated successfully`);
      } else {
        result = await incomeCategoryService.createIncomeCategory(formData);
        success(`Income category "${result.name}" created successfully`);
      }

      onSuccess(result);
      onClose();
    } catch (error: any) {
      console.error('Error saving income category:', error);
      showError(error.message || `Failed to ${editCategory ? 'update' : 'create'} income category`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: any) => {
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <DollarSign className="w-6 h-6 text-green-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">
              {editCategory ? 'Edit Income Category' : 'Create Income Category'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => handleInputChange('name', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., Tuition Fees"
                maxLength={200}
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
                Category Code *
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={e => handleInputChange('code', e.target.value.toUpperCase())}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.code ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., TUITION"
                maxLength={20}
              />
              {errors.code && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {errors.code}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={e => handleInputChange('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe this income category..."
              rows={3}
            />
          </div>

          {/* Income Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Income Account *</label>
            {loadingAccounts ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <select
                value={formData.income_account}
                onChange={e => handleInputChange('income_account', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.income_account ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value={0}>Select an income account</option>
                {incomeAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            )}
            {errors.income_account && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.income_account}
              </p>
            )}
          </div>

          {/* Parent Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parent Category (Optional)
            </label>
            <select
              value={formData.parent_category || ''}
              onChange={e =>
                handleInputChange(
                  'parent_category',
                  e.target.value ? parseInt(e.target.value) : null
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No parent category</option>
              {parentCategories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.code} - {category.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={e => handleInputChange('is_active', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
              Category is active
            </label>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : editCategory ? 'Update Category' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IncomeCategoryModal;
