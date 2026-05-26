import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Save,
  User,
  DollarSign,
  Calendar,
  FileText,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../hooks/useToast';
import { hrService } from '../../services/hrService';
import { CreateBonusDeductionRequestData } from '../../types/hr';
import { Breadcrumb } from '../../components/ui/Breadcrumb';

// Validation schema
const bonusDeductionSchema = z.object({
  staff: z
    .number({ required_error: 'Staff member is required' })
    .min(1, 'Please select a staff member'),
  component: z
    .number({ required_error: 'Component is required' })
    .min(1, 'Please select a component'),
  amount: z
    .number({ required_error: 'Amount is required' })
    .min(0.01, 'Amount must be greater than 0')
    .max(999999.99, 'Amount is too large'),
  reason: z
    .string({ required_error: 'Reason is required' })
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason cannot exceed 500 characters'),
  for_month: z.string({ required_error: 'Target month is required' }),
});

type FormData = {
  staff: number;
  component: number;
  amount: number;
  reason: string;
  for_month: string;
};

const BonusDeductionFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();

  const [selectedComponentType, setSelectedComponentType] = useState<
    'EARNING' | 'DEDUCTION' | null
  >(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(bonusDeductionSchema),
    defaultValues: {
      staff: 0,
      component: 0,
      amount: 0,
      reason: '',
      for_month: '',
    },
  });

  const watchedComponent = watch('component');

  // Fetch staff for dropdown
  const { data: staffOptions, isLoading: isLoadingStaff } = useQuery({
    queryKey: ['staff-dropdown'],
    queryFn: () => hrService.getStaffForDropdown(),
  });

  // Fetch salary components for dropdown
  const { data: componentOptions, isLoading: isLoadingComponents } = useQuery({
    queryKey: ['salary-components-dropdown'],
    queryFn: () => hrService.getSalaryComponentsForDropdown(),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateBonusDeductionRequestData) =>
      hrService.createBonusDeductionRequest(data),
    onSuccess: data => {
      success('Bonus/Deduction request created successfully');
      queryClient.invalidateQueries({ queryKey: ['bonus-deduction-requests'] });
      queryClient.invalidateQueries({ queryKey: ['bonus-deduction-pending-count'] });
      navigate(`/hr/bonus-deduction`);
    },
    onError: (error: any) => {
      const details = error?.details || error?.response?.data || {};
      const fieldErrors = Object.entries(details)
        .filter(([k]) => k !== 'detail' && k !== 'message' && k !== 'non_field_errors')
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
      const nonField = details?.non_field_errors;
      const nonFieldMsg = Array.isArray(nonField) ? nonField.join(' ') : nonField;
      const message =
        fieldErrors.length > 0
          ? fieldErrors.join(' | ')
          : nonFieldMsg || error?.message || details?.detail || 'Failed to create request';
      showError(message);
    },
  });

  const onInvalid = (fieldErrors: Record<string, any>) => {
    const first = Object.values(fieldErrors)[0];
    const msg = first?.message || 'Please fix the errors below before submitting.';
    showError(msg);
  };

  const onSubmit = (data: FormData) => {
    // Convert YYYY-MM format to YYYY-MM-01 format as required by API
    const formattedMonth = data.for_month.includes('-01') ? data.for_month : `${data.for_month}-01`;

    const submitData: CreateBonusDeductionRequestData = {
      staff: data.staff,
      component: data.component,
      amount: data.amount,
      reason: data.reason.trim(),
      for_month: formattedMonth,
    };

    createMutation.mutate(submitData);
  };

  // Handle component selection to update component type
  const handleComponentChange = (componentId: number) => {
    setValue('component', componentId);

    if (componentOptions) {
      const selectedComponent = [...componentOptions.earnings, ...componentOptions.deductions].find(
        comp => comp.id === componentId
      );

      if (selectedComponent) {
        const isEarning = componentOptions.earnings.some(comp => comp.id === componentId);
        setSelectedComponentType(isEarning ? 'EARNING' : 'DEDUCTION');

        // Set default amount from component
        if (selectedComponent.default_amount && parseFloat(selectedComponent.default_amount) > 0) {
          setValue('amount', parseFloat(selectedComponent.default_amount));
        }
      }
    }
  };

  // Generate default month (current month)
  const getCurrentMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  };

  // Set default month on component mount
  React.useEffect(() => {
    if (!watch('for_month')) {
      setValue('for_month', getCurrentMonth());
    }
  }, [setValue, watch]);

  const getComponentTypeIcon = (type: 'EARNING' | 'DEDUCTION' | null) => {
    if (type === 'EARNING') {
      return <TrendingUp className="h-5 w-5 text-green-600" />;
    } else if (type === 'DEDUCTION') {
      return <TrendingDown className="h-5 w-5 text-red-600" />;
    }
    return <DollarSign className="h-5 w-5 text-gray-400" />;
  };

  const getComponentTypeColor = (type: 'EARNING' | 'DEDUCTION' | null) => {
    if (type === 'EARNING') return 'text-green-600 bg-green-50 border-green-200';
    if (type === 'DEDUCTION') return 'text-red-600 bg-red-50 border-red-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  const breadcrumbItems = [
    { label: 'HR & Payroll', href: '/hr' },
    { label: 'Bonus & Deduction Requests', href: '/hr/bonus-deduction' },
    { label: 'Create Request', current: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Breadcrumb */}
        <Breadcrumb items={breadcrumbItems} className="mb-4 sm:mb-6" />

        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/hr/bonus-deduction')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                Create Bonus/Deduction Request
              </h1>
              <p className="text-sm sm:text-base text-gray-600">
                Submit a new salary adjustment request for approval
              </p>
            </div>
          </div>

          {/* Request Type Indicator */}
          {selectedComponentType && (
            <div
              className={`inline-flex items-center px-3 py-2 rounded-lg border ${getComponentTypeColor(selectedComponentType)}`}
            >
              {getComponentTypeIcon(selectedComponentType)}
              <span className="ml-2 font-medium text-sm sm:text-base">
                {selectedComponentType === 'EARNING' ? 'Bonus Request' : 'Deduction Request'}
              </span>
            </div>
          )}
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg shadow">
          <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Staff Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="h-4 w-4 inline mr-1" />
                Staff Member *
              </label>
              <Controller
                name="staff"
                control={control}
                render={({ field }) => (
                  <select
                    {...field}
                    value={field.value || ''}
                    onChange={e => field.onChange(e.target.value ? Number(e.target.value) : 0)}
                    className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base ${
                      errors.staff ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={isLoadingStaff}
                  >
                    <option value="">Select staff member...</option>
                    {staffOptions?.map(staff => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name} {staff.department && `(${staff.department})`}
                      </option>
                    ))}
                  </select>
                )}
              />
              {errors.staff && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                  {errors.staff.message}
                </p>
              )}
              {isLoadingStaff && (
                <p className="mt-1 text-sm text-gray-500">Loading staff members...</p>
              )}
            </div>

            {/* Component Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <DollarSign className="h-4 w-4 inline mr-1" />
                Salary Component *
              </label>
              <Controller
                name="component"
                control={control}
                render={({ field }) => (
                  <select
                    {...field}
                    value={field.value || ''}
                    onChange={e => {
                      const componentId = e.target.value ? Number(e.target.value) : 0;
                      handleComponentChange(componentId);
                    }}
                    className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base ${
                      errors.component ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={isLoadingComponents}
                  >
                    <option value="">Select component...</option>
                    {componentOptions?.earnings && componentOptions.earnings.length > 0 && (
                      <optgroup label="Bonuses (Earnings)">
                        {componentOptions.earnings.map(component => (
                          <option key={component.id} value={component.id}>
                            {component.name} (Default: ₦
                            {parseFloat(component.default_amount).toLocaleString()})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {componentOptions?.deductions && componentOptions.deductions.length > 0 && (
                      <optgroup label="Deductions">
                        {componentOptions.deductions.map(component => (
                          <option key={component.id} value={component.id}>
                            {component.name} (Default: ₦
                            {parseFloat(component.default_amount).toLocaleString()})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                )}
              />
              {errors.component && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                  {errors.component.message}
                </p>
              )}
              {isLoadingComponents && (
                <p className="mt-1 text-sm text-gray-500">Loading salary components...</p>
              )}
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <DollarSign className="h-4 w-4 inline mr-1" />
                Amount *
              </label>
              <Controller
                name="amount"
                control={control}
                render={({ field }) => (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                      ₦
                    </span>
                    <input
                      {...field}
                      type="number"
                      step="0.01"
                      min="0"
                      max="999999.99"
                      placeholder="0.00"
                      className={`w-full pl-8 pr-3 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base ${
                        errors.amount ? 'border-red-300' : 'border-gray-300'
                      }`}
                      onChange={e =>
                        field.onChange(e.target.value ? parseFloat(e.target.value) : 0)
                      }
                    />
                  </div>
                )}
              />
              {errors.amount && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                  {errors.amount.message}
                </p>
              )}
              {selectedComponentType && (
                <p
                  className={`mt-1 text-sm ${selectedComponentType === 'EARNING' ? 'text-green-600' : 'text-red-600'}`}
                >
                  This amount will be{' '}
                  {selectedComponentType === 'EARNING' ? 'added to' : 'deducted from'} the staff
                  member's salary
                </p>
              )}
            </div>

            {/* Target Month */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="h-4 w-4 inline mr-1" />
                Target Payroll Month *
              </label>
              <Controller
                name="for_month"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="month"
                    className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base ${
                      errors.for_month ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                )}
              />
              {errors.for_month && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                  {errors.for_month.message}
                </p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                Select the payroll month when this adjustment should be applied
              </p>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="h-4 w-4 inline mr-1" />
                Reason *
              </label>
              <Controller
                name="reason"
                control={control}
                render={({ field }) => (
                  <textarea
                    {...field}
                    rows={4}
                    placeholder="Provide a detailed reason for this bonus/deduction request..."
                    className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-base ${
                      errors.reason ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                )}
              />
              {errors.reason && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                  {errors.reason.message}
                </p>
              )}
              <div className="mt-1 flex justify-between text-sm text-gray-500">
                <span>Minimum 10 characters required</span>
                <span>{watch('reason')?.length || 0}/500</span>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4 sm:pt-6 border-t border-gray-200">
              <button
                type="submit"
                disabled={isSubmitting || createMutation.isPending}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center font-medium text-base touch-manipulation"
                style={{ minHeight: '48px' }}
              >
                {isSubmitting || createMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating Request...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Create Request
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => navigate('/hr/bonus-deduction')}
                disabled={isSubmitting || createMutation.isPending}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium text-base touch-manipulation"
                style={{ minHeight: '48px' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        {/* Help Text */}
        <div className="mt-4 sm:mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <h4 className="font-medium mb-1">Request Process</h4>
              <ul className="space-y-1 text-blue-700 text-sm">
                <li>• Your request will be submitted for approval</li>
                <li>
                  • Once approved, the adjustment will be included in the selected month's payroll
                </li>
                <li>• You can track the status of your request in the requests list</li>
                <li>• Provide a clear reason to help with the approval process</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BonusDeductionFormPage;
