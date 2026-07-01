import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Building,
  Package,
} from 'lucide-react';
import {
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
  useExpenseCategory,
} from '../../hooks/useExpenseCategories';
import { accountService } from '../../services/accountService';
import { CreateExpenseCategory, UpdateExpenseCategory } from '../../types/expenseCategory';
import { Account } from '../../types/accounts';
import { useToast } from '../../hooks/useToast';

const ExpenseCategoryFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const { success: toastSuccess, error: toastError } = useToast();

  const [formData, setFormData] = useState<CreateExpenseCategory>({
    name: '',
    code: '',
    description: '',
    expense_account: 0,
    prepaid_account: null,
    product: null,
    requires_approval: false,
    approval_threshold: '',
    budget_amount: null,
    budget_period: 'yearly',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [assetAccounts, setAssetAccounts] = useState<Account[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);

  // Queries and mutations
  const { data: existingCategory } = useExpenseCategory(Number(id), isEditing);
  const createCategory = useCreateExpenseCategory();
  const updateCategory = useUpdateExpenseCategory();

  // Load accounts on component mount
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        setIsLoadingAccounts(true);
        const [expenseAccountsData, assetAccountsData] = await Promise.all([
          accountService.getAccounts({ account_type: 'EXPENSE' }),
          accountService.getAccounts({ account_type: 'ASSET' }),
        ]);

        setExpenseAccounts(expenseAccountsData);
        setAssetAccounts(assetAccountsData);
      } catch (error) {
        console.error('Failed to load accounts:', error);
        toastError('Failed to load accounts. Please refresh the page.');
      } finally {
        setIsLoadingAccounts(false);
      }
    };

    loadAccounts();
  }, []);

  // Populate form when editing
  useEffect(() => {
    if (existingCategory && isEditing) {
      setFormData({
        name: existingCategory.name,
        code: existingCategory.code,
        description: existingCategory.description || '',
        expense_account: existingCategory.expense_account,
        prepaid_account: existingCategory.prepaid_account,
        product: existingCategory.product,
        requires_approval: existingCategory.requires_approval,
        approval_threshold: existingCategory.approval_threshold || '',
        budget_amount: existingCategory.budget_amount || null,
        budget_period: existingCategory.budget_period || 'yearly',
      });
    }
  }, [existingCategory, isEditing]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : type === 'number'
            ? value === ''
              ? null
              : Number(value)
            : value,
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
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
      newErrors.code = 'Code must be 20 characters or less';
    }

    if (!formData.expense_account) {
      newErrors.expense_account = 'Expense account is required';
    }

    if (formData.requires_approval && formData.approval_threshold) {
      const threshold = parseFloat(formData.approval_threshold);
      if (isNaN(threshold) || threshold < 0) {
        newErrors.approval_threshold = 'Approval threshold must be a valid positive number';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      if (isEditing) {
        await updateCategory.mutateAsync({
          id: Number(id),
          data: formData as UpdateExpenseCategory,
        });
        toastSuccess('Expense category updated successfully');
      } else {
        await createCategory.mutateAsync(formData);
        toastSuccess('Expense category created successfully');
      }
      navigate('/expenses/categories');
    } catch (error: any) {
      console.error('Failed to save expense category:', error);
      toastError('Failed to save expense category. Please try again.');
    }
  };

  if (isLoadingAccounts) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading accounts...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/expenses/categories')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={20} />
          Back to Categories
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditing ? 'Edit Expense Category' : 'Create Expense Category'}
          </h1>
          <p className="text-gray-600">
            {isEditing
              ? 'Update expense category details'
              : 'Add a new expense category to the system'}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="e.g., Office Supplies, Travel Expenses"
                  required
                />
                {errors.name && (
                  <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                    <AlertTriangle size={14} />
                    {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Code *
                </label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleInputChange}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.code ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="e.g., OFF-SUP, TRAVEL"
                  maxLength={20}
                  required
                />
                {errors.code && (
                  <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                    <AlertTriangle size={14} />
                    {errors.code}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Describe what this category covers..."
              />
            </div>
          </div>

          {/* Account Configuration */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Account Configuration
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expense Account *
                </label>
                <select
                  name="expense_account"
                  value={formData.expense_account}
                  onChange={handleInputChange}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.expense_account ? 'border-red-300' : 'border-gray-300'
                  }`}
                  required
                >
                  <option value="">Select expense account</option>
                  {expenseAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </select>
                {errors.expense_account && (
                  <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                    <AlertTriangle size={14} />
                    {errors.expense_account}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  Account where expenses will be recorded
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prepaid Account (Optional)
                </label>
                <select
                  name="prepaid_account"
                  value={formData.prepaid_account || ''}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">No prepaid account</option>
                  {assetAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  Account for prepaid expenses (if applicable)
                </p>
              </div>
            </div>
          </div>

          {/* Approval Settings */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-purple-600" />
              Approval Settings
            </h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="requires_approval"
                  checked={formData.requires_approval}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label className="text-sm font-medium text-gray-700">
                  Requires approval for expenses
                </label>
              </div>

              {formData.requires_approval && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Approval Threshold (Optional)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="number"
                      name="approval_threshold"
                      value={formData.approval_threshold}
                      onChange={handleInputChange}
                      className={`w-full border rounded-md pl-10 pr-3 py-2 ${
                        errors.approval_threshold ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                    />
                  </div>
                  {errors.approval_threshold && (
                    <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                      <AlertTriangle size={14} />
                      {errors.approval_threshold}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 mt-1">
                    Expenses above this amount will require approval (leave empty for all expenses)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Product Association */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Budget Settings
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Budget Amount (Optional)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="number"
                    name="budget_amount"
                    value={formData.budget_amount || ''}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Set a budget limit for this expense category
                </p>
              </div>

              {formData.budget_amount && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Budget Period
                  </label>
                  <select
                    name="budget_period"
                    aria-label="Budget period"
                    value={formData.budget_period || 'yearly'}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  <p className="text-sm text-gray-500 mt-1">How often the budget resets</p>
                </div>
              )}
            </div>
          </div>

          {/* Product Association */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Building className="h-5 w-5 text-orange-600" />
              Product Association
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Associated Product (Optional)
              </label>
              <input
                type="number"
                name="product"
                value={formData.product || ''}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Product ID"
              />
              <p className="text-sm text-gray-500 mt-1">
                Link this category to a specific product for better tracking
              </p>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/expenses/categories')}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createCategory.isPending || updateCategory.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={16} />
              {createCategory.isPending || updateCategory.isPending
                ? 'Saving...'
                : isEditing
                  ? 'Update Category'
                  : 'Create Category'}
            </button>
          </div>
        </form>
      </div>

      {/* Help Section */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">
          💡 Tips for Creating Expense Categories
        </h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Use clear, descriptive names that are easy to understand</li>
          <li>• Keep codes short but meaningful (e.g., TRAVEL, OFFICE, FUEL)</li>
          <li>• Set up approval requirements for categories that need oversight</li>
          <li>• Link prepaid accounts for expenses that are paid in advance</li>
          <li>• Use approval thresholds to automate the approval process</li>
        </ul>
      </div>
    </div>
  );
};

export default ExpenseCategoryFormPage;
