import React, { useState } from 'react';
import { DollarSign, X } from 'lucide-react';
import { useAllStaff } from '../../hooks/useStaff';
import { useAllSalaryComponents } from '../../hooks/useSalaryComponents';
import { hrService } from '../../services/hrService';
import { useToast } from '../../contexts/ToastContext';

interface BonusDeductionRequestFormProps {
  staffId?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const BonusDeductionRequestForm: React.FC<BonusDeductionRequestFormProps> = ({
  staffId,
  onSuccess,
  onCancel,
}) => {
  const { success, error: showError } = useToast();
  const { data: staffData = [] } = useAllStaff();
  const { data: salaryComponents = [] } = useAllSalaryComponents();

  const [formData, setFormData] = useState({
    staff: staffId || 0,
    component: 0,
    amount: '',
    reason: '',
    for_month: new Date().toISOString().slice(0, 7) + '-01', // YYYY-MM-01
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const staffList = staffData || [];

  const selectedComponent = salaryComponents.find(
    comp => comp.id === parseInt(formData.component.toString())
  );

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.staff) newErrors.staff = 'Staff member is required';
    if (!formData.component) newErrors.component = 'Component is required';
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }
    if (!formData.reason.trim()) {
      newErrors.reason = 'Reason is required';
    } else if (formData.reason.trim().length < 10) {
      newErrors.reason = 'Reason must be at least 10 characters';
    }
    if (!formData.for_month) newErrors.for_month = 'Month is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await hrService.createBonusDeductionRequest({
        ...formData,
        staff: parseInt(formData.staff.toString()),
        component: parseInt(formData.component.toString()),
        amount: parseFloat(formData.amount),
      });

      success('Bonus/deduction request submitted successfully');
      onSuccess?.();
    } catch (err: any) {
      const details = err?.details || err?.response?.data || {};
      const fieldErrors = Object.entries(details)
        .filter(([k]) => k !== 'detail' && k !== 'message' && k !== 'non_field_errors')
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
      const nonField = details?.non_field_errors;
      const nonFieldMsg = Array.isArray(nonField) ? nonField.join(' ') : nonField;
      const message =
        fieldErrors.length > 0
          ? fieldErrors.join(' | ')
          : nonFieldMsg || err?.message || details?.detail || 'Failed to submit request';
      showError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <DollarSign className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Request Bonus/Deduction</h2>
            <p className="text-sm text-gray-600">
              Submit a one-time bonus or deduction request for approval
            </p>
          </div>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Staff Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member *</label>
          <select
            value={formData.staff}
            onChange={e => handleChange('staff', e.target.value)}
            disabled={!!staffId || isSubmitting}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.staff ? 'border-red-300' : 'border-gray-300'
            } ${staffId ? 'bg-gray-100' : ''}`}
          >
            <option value="">Select Staff</option>
            {staffList.map(staff => (
              <option key={staff.id} value={staff.id}>
                {staff.full_name} - {staff.position || 'N/A'}
              </option>
            ))}
          </select>
          {errors.staff && <p className="mt-1 text-sm text-red-600">{errors.staff}</p>}
        </div>

        {/* Component Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Component *</label>
          <select
            value={formData.component}
            onChange={e => handleChange('component', e.target.value)}
            disabled={isSubmitting}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.component ? 'border-red-300' : 'border-gray-300'
            }`}
          >
            <option value="">Select Component</option>
            {salaryComponents.map(comp => (
              <option key={comp.id} value={comp.id}>
                {comp.name} ({comp.component_type === 'EARNING' ? 'Bonus' : 'Deduction'})
              </option>
            ))}
          </select>
          {errors.component && <p className="mt-1 text-sm text-red-600">{errors.component}</p>}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <DollarSign className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={e => handleChange('amount', e.target.value)}
              disabled={isSubmitting}
              placeholder="0.00"
              className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.amount ? 'border-red-300' : 'border-gray-300'
              }`}
            />
          </div>
          {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount}</p>}
        </div>

        {/* For Month */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Apply to Month *</label>
          <input
            type="month"
            value={formData.for_month.slice(0, 7)}
            onChange={e => handleChange('for_month', e.target.value + '-01')}
            disabled={isSubmitting}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.for_month ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {errors.for_month && <p className="mt-1 text-sm text-red-600">{errors.for_month}</p>}
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
          <textarea
            value={formData.reason}
            onChange={e => handleChange('reason', e.target.value)}
            disabled={isSubmitting}
            rows={4}
            placeholder="Provide a detailed justification for this request..."
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.reason ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {errors.reason && <p className="mt-1 text-sm text-red-600">{errors.reason}</p>}
        </div>

        {/* Summary */}
        {selectedComponent && formData.amount && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900">Request Summary</p>
            <p className="text-sm text-blue-800 mt-1">
              {selectedComponent.component_type === 'EARNING' ? 'Bonus' : 'Deduction'}:{' '}
              <span className="font-semibold">${parseFloat(formData.amount).toFixed(2)}</span>
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Will be applied to payroll for{' '}
              {new Date(formData.for_month).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default BonusDeductionRequestForm;
