import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  Calendar,
  DollarSign,
  Users,
  Settings,
  AlertCircle,
  Info,
} from 'lucide-react';
import { discountService, DiscountProgramCreateData } from '../../services/discountService';
import { accountService } from '../../services/accountService';
import { Account } from '../../types/accounts';
import { useToast } from '../../hooks/useToast';

const DiscountProgramForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<DiscountProgramCreateData>({
    name: '',
    description: '',
    program_type: 'discount',
    discount_type: 'percentage',
    discount_value: '',
    budget_allocated: '',
    max_recipients: undefined,
    start_date: '',
    end_date: '',
    is_active: true,
    is_renewable: false,
    renewal_period: 'none',
    requires_approval: true,
    approval_workflow: undefined,
    eligibility_criteria: {},
    discount_account: 0,
  });

  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    fetchAccounts();
    if (isEditing && id) {
      fetchProgram();
    }
  }, [id, isEditing]);

  const fetchAccounts = async () => {
    try {
      setAccountsLoading(true);
      const accountsData = await accountService.getAccounts({
        is_active: true,
      });
      setAccounts(accountsData);
    } catch (error) {
      toast.error('Failed to fetch accounts');
      console.error('Error fetching accounts:', error);
    } finally {
      setAccountsLoading(false);
    }
  };

  const fetchProgram = async () => {
    try {
      setLoading(true);
      // Note: We'd need a GET endpoint for single program, using the list endpoint for now
      const response = await discountService.getDiscountPrograms({ search: id });
      const program = response.results.find((p: any) => p.id === parseInt(id!));

      if (program) {
        setFormData({
          name: program.name,
          description: program.description || '',
          program_type: program.program_type,
          discount_type: program.discount_type,
          discount_value: program.discount_value,
          budget_allocated: program.budget_allocated || '',
          max_recipients: program.max_recipients || undefined,
          start_date: program.start_date,
          end_date: program.end_date || '',
          is_active: program.is_active,
          is_renewable: program.is_renewable,
          renewal_period: program.renewal_period || 'none',
          requires_approval: program.requires_approval,
          approval_workflow: program.approval_workflow || undefined,
          eligibility_criteria: program.eligibility_criteria || {},
          discount_account: program.discount_account,
        });
      }
    } catch (error) {
      toast.error('Failed to fetch program details');
      console.error('Error fetching program:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof DiscountProgramCreateData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Program name is required';
    }

    if (!formData.discount_value) {
      newErrors.discount_value = 'Discount value is required';
    } else {
      const value = parseFloat(formData.discount_value);
      if (isNaN(value) || value < 0) {
        newErrors.discount_value = 'Discount value must be a positive number';
      }
      if (formData.discount_type === 'percentage' && value > 100) {
        newErrors.discount_value = 'Percentage cannot exceed 100%';
      }
    }

    if (!formData.start_date) {
      newErrors.start_date = 'Start date is required';
    }

    if (!formData.discount_account) {
      newErrors.discount_account = 'Discount account is required';
    }

    if (formData.budget_allocated && parseFloat(formData.budget_allocated) < 0) {
      newErrors.budget_allocated = 'Budget must be positive';
    }

    if (formData.max_recipients && formData.max_recipients < 0) {
      newErrors.max_recipients = 'Max recipients must be positive';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors before submitting');
      return;
    }

    try {
      setSaving(true);

      const submitData = {
        ...formData,
        budget_allocated: formData.budget_allocated || undefined,
        max_recipients: formData.max_recipients || undefined,
        end_date: formData.end_date || undefined,
        approval_workflow: formData.approval_workflow || undefined,
      };

      if (isEditing && id) {
        await discountService.updateDiscountProgram(parseInt(id), submitData);
        toast.success('Discount program updated successfully');
      } else {
        await discountService.createDiscountProgram(submitData);
        toast.success('Discount program created successfully');
      }

      navigate('/discounts/programs');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save discount program');
      console.error('Error saving program:', error);
    } finally {
      setSaving(false);
    }
  };

  const getProgramTypeLabel = (type: string) => {
    const labels = {
      scholarship: 'Scholarship/Grant',
      staff_benefit: 'Staff Benefit',
      discount: 'Customer Discount',
      waiver: 'Fee Waiver',
      insurance: 'Insurance Coverage',
      promotion: 'Promotional Discount',
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getDiscountTypeLabel = (type: string) => {
    const labels = {
      percentage: 'Percentage Discount',
      fixed_amount: 'Fixed Amount Discount',
      full_waiver: 'Full Waiver (100%)',
    };
    return labels[type as keyof typeof labels] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/discounts/programs')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditing ? 'Edit Discount Program' : 'Create Discount Program'}
            </h1>
            <p className="text-gray-600">
              {isEditing
                ? 'Update program details and settings'
                : 'Set up a new discount or scholarship program'}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Info className="h-5 w-5" />
            Basic Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Program Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => handleInputChange('name', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.name ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="e.g., Merit Scholarship 2026"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Program Type *</label>
              <select
                value={formData.program_type}
                onChange={e => handleInputChange('program_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="scholarship">Scholarship/Grant</option>
                <option value="staff_benefit">Staff Benefit</option>
                <option value="discount">Customer Discount</option>
                <option value="waiver">Fee Waiver</option>
                <option value="insurance">Insurance Coverage</option>
                <option value="promotion">Promotional Discount</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={e => handleInputChange('description', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Describe the program purpose and eligibility..."
              />
            </div>
          </div>
        </div>

        {/* Discount Configuration */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Discount Configuration
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Discount Type *
              </label>
              <select
                value={formData.discount_type}
                onChange={e => handleInputChange('discount_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="percentage">Percentage Discount</option>
                <option value="fixed_amount">Fixed Amount Discount</option>
                <option value="full_waiver">Full Waiver (100%)</option>
              </select>
            </div>

            {formData.discount_type !== 'full_waiver' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Discount Value *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={formData.discount_type === 'percentage' ? '100' : undefined}
                    value={formData.discount_value}
                    onChange={e => handleInputChange('discount_value', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.discount_value ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder={formData.discount_type === 'percentage' ? '0-100' : '0.00'}
                  />
                  {formData.discount_type === 'percentage' && (
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                      %
                    </span>
                  )}
                </div>
                {errors.discount_value && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {errors.discount_value}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Discount Account *
              </label>
              <select
                value={formData.discount_account}
                onChange={e => handleInputChange('discount_account', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.discount_account ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                <option value={0}>Select Account</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name} ({account.account_type})
                  </option>
                ))}
              </select>
              {errors.discount_account && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.discount_account}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Budget & Limits */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="h-5 w-5" />
            Budget & Limits
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Budget Allocated
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.budget_allocated}
                onChange={e => handleInputChange('budget_allocated', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.budget_allocated ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0.00 (leave empty for unlimited)"
              />
              {errors.budget_allocated && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.budget_allocated}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">Leave empty for unlimited budget</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Recipients
              </label>
              <input
                type="number"
                min="0"
                value={formData.max_recipients || ''}
                onChange={e =>
                  handleInputChange(
                    'max_recipients',
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.max_recipients ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Leave empty for unlimited"
              />
              {errors.max_recipients && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.max_recipients}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">Leave empty for unlimited recipients</p>
            </div>
          </div>
        </div>

        {/* Validity Period */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Validity Period
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
              <input
                type="date"
                value={formData.start_date}
                onChange={e => handleInputChange('start_date', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.start_date ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.start_date && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.start_date}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={formData.end_date}
                onChange={e => handleInputChange('end_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">Leave empty for no end date</p>
            </div>
          </div>
        </div>

        {/* Program Settings */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Program Settings
          </h2>

          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={e => handleInputChange('is_active', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                Program is active
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="requires_approval"
                checked={formData.requires_approval}
                onChange={e => handleInputChange('requires_approval', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="requires_approval" className="ml-2 block text-sm text-gray-900">
                Requires approval for applications
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_renewable"
                checked={formData.is_renewable}
                onChange={e => handleInputChange('is_renewable', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="is_renewable" className="ml-2 block text-sm text-gray-900">
                Program is renewable
              </label>
            </div>

            {formData.is_renewable && (
              <div className="ml-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Renewal Period
                </label>
                <select
                  value={formData.renewal_period}
                  onChange={e => handleInputChange('renewal_period', e.target.value)}
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="term">Per Term</option>
                  <option value="semester">Per Semester</option>
                  <option value="year">Per Year</option>
                  <option value="none">One-Time</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-4 pt-6 border-t">
          <button
            type="button"
            onClick={() => navigate('/discounts/programs')}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Saving...' : isEditing ? 'Update Program' : 'Create Program'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DiscountProgramForm;
