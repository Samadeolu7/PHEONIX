import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Save,
  Settings,
  Users,
  Calendar,
  DollarSign,
  Clock,
  AlertCircle,
  BadgeCheck,
  Shield,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useHRConfig } from '../../hooks/useHRConfig';
import { hrConfigSchema, HRConfigFormData } from '../../schemas/hrConfigSchema';
import WorkflowSelector from '../../components/hr/WorkflowSelector';

const HRConfigPage: React.FC = () => {
  const { config, workflows, isLoading, isLoadingWorkflows, updateConfig, isUpdating } =
    useHRConfig();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    watch,
    reset,
  } = useForm<HRConfigFormData>({
    resolver: zodResolver(hrConfigSchema),
    defaultValues: {
      enable_leave_approval: true,
      max_consecutive_leave_days: 14,
      annual_leave_days: 20,
      sick_leave_days: 10,
      working_hours_per_day: 8,
      late_arrival_grace_minutes: 15,
      enable_attendance_tracking: true,
      payroll_currency: 'NGN',
      payroll_frequency: 'monthly',
      tax_rate_percentage: 0,
      enable_overtime_calculation: true,
      overtime_multiplier: 1.5,
      // Staff ID defaults
      staff_id_prefix: 'STF',
      staff_id_padding: 3,
      // Pension defaults
      enable_pension: false,
      employee_pension_rate: 8,
      employer_pension_rate: 10,
      pension_provider_name: '',
      // PAYE / Tax defaults
      enable_paye: true,
      enable_development_levy: true,
      development_levy_annual_amount: 1000,
      default_leave_workflow: null,
      extended_leave_workflow: null,
      payroll_approval_workflow: null,
    },
  });

  // Update form when config is loaded
  React.useEffect(() => {
    if (config) {
      reset({
        enable_leave_approval: config.enable_leave_approval,
        max_consecutive_leave_days: config.max_consecutive_leave_days,
        annual_leave_days: config.annual_leave_days,
        sick_leave_days: config.sick_leave_days,
        working_hours_per_day: parseFloat(config.working_hours_per_day),
        late_arrival_grace_minutes: config.late_arrival_grace_minutes,
        enable_attendance_tracking: config.enable_attendance_tracking,
        payroll_currency: config.payroll_currency,
        payroll_frequency: config.payroll_frequency,
        tax_rate_percentage: parseFloat(config.tax_rate_percentage),
        enable_overtime_calculation: config.enable_overtime_calculation,
        overtime_multiplier: parseFloat(config.overtime_multiplier),
        // Staff ID
        staff_id_prefix: config.staff_id_prefix || 'STF',
        staff_id_padding: config.staff_id_padding || 3,
        // Pension
        enable_pension: config.enable_pension || false,
        employee_pension_rate: parseFloat(config.employee_pension_rate) || 8,
        employer_pension_rate: parseFloat(config.employer_pension_rate) || 10,
        pension_provider_name: config.pension_provider_name || '',
        // PAYE / Tax
        enable_paye: config.enable_paye !== false,
        enable_development_levy: config.enable_development_levy !== false,
        development_levy_annual_amount: parseFloat(config.development_levy_annual_amount) || 1000,
        default_leave_workflow: config.default_leave_workflow,
        extended_leave_workflow: config.extended_leave_workflow,
        payroll_approval_workflow: config.payroll_approval_workflow,
      });
    }
  }, [config, reset]);

  const onSubmit = (data: HRConfigFormData) => {
    updateConfig({
      enable_leave_approval: data.enable_leave_approval,
      max_consecutive_leave_days: data.max_consecutive_leave_days,
      annual_leave_days: data.annual_leave_days,
      sick_leave_days: data.sick_leave_days,
      working_hours_per_day: data.working_hours_per_day.toString(),
      late_arrival_grace_minutes: data.late_arrival_grace_minutes,
      enable_attendance_tracking: data.enable_attendance_tracking,
      payroll_currency: data.payroll_currency,
      payroll_frequency: data.payroll_frequency,
      tax_rate_percentage: data.tax_rate_percentage.toString(),
      enable_overtime_calculation: data.enable_overtime_calculation,
      overtime_multiplier: data.overtime_multiplier.toString(),
      // Staff ID
      staff_id_prefix: data.staff_id_prefix,
      staff_id_padding: data.staff_id_padding,
      // Pension
      enable_pension: data.enable_pension,
      employee_pension_rate: data.employee_pension_rate.toString(),
      employer_pension_rate: data.employer_pension_rate.toString(),
      pension_provider_name: data.pension_provider_name,
      // PAYE / Tax
      enable_paye: data.enable_paye,
      enable_development_levy: data.enable_development_levy,
      development_levy_annual_amount: data.development_levy_annual_amount.toString(),
      default_leave_workflow: data.default_leave_workflow,
      extended_leave_workflow: data.extended_leave_workflow,
      payroll_approval_workflow: data.payroll_approval_workflow,
    });
  };

  if (isLoading || isLoadingWorkflows) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading HR configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 sm:py-0 sm:h-16 space-y-3 sm:space-y-0">
            <div className="flex items-center space-x-4">
              <Link
                to="/hr"
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft size={20} className="mr-2" />
                <span className="hidden sm:inline">Back to HR</span>
                <span className="sm:hidden">Back</span>
              </Link>
              <div className="hidden sm:block h-6 w-px bg-gray-300"></div>
              <div className="flex items-center space-x-2">
                <Settings className="text-blue-600" size={24} />
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900">HR Configuration</h1>
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end space-x-3">
              {isDirty && (
                <div className="flex items-center text-amber-600 text-sm">
                  <AlertCircle size={16} className="mr-1" />
                  <span className="hidden sm:inline">Unsaved changes</span>
                  <span className="sm:hidden">Unsaved</span>
                </div>
              )}
              <button
                type="submit"
                form="hr-config-form"
                disabled={isUpdating || !isDirty}
                className={`
                  flex items-center px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-colors
                  ${
                    isUpdating || !isDirty
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }
                `}
              >
                <Save size={16} className="mr-2" />
                <span className="hidden sm:inline">
                  {isUpdating ? 'Saving...' : 'Save Configuration'}
                </span>
                <span className="sm:hidden">{isUpdating ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form id="hr-config-form" onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Leave Management Settings */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center space-x-3 mb-6">
              <Calendar className="text-green-600" size={24} />
              <h2 className="text-lg font-semibold text-gray-900">Leave Management Settings</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register('enable_leave_approval')}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Require approval for leave requests
                  </span>
                </label>
              </div>

              <div>
                <label
                  htmlFor="max_consecutive_leave_days"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Maximum Consecutive Leave Days
                </label>
                <input
                  type="number"
                  id="max_consecutive_leave_days"
                  {...register('max_consecutive_leave_days')}
                  className={`
                    block w-full px-3 py-2 border rounded-md shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    ${errors.max_consecutive_leave_days ? 'border-red-300' : 'border-gray-300'}
                  `}
                />
                {errors.max_consecutive_leave_days && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.max_consecutive_leave_days.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="annual_leave_days"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Annual Leave Days
                </label>
                <input
                  type="number"
                  id="annual_leave_days"
                  {...register('annual_leave_days')}
                  className={`
                    block w-full px-3 py-2 border rounded-md shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    ${errors.annual_leave_days ? 'border-red-300' : 'border-gray-300'}
                  `}
                />
                {errors.annual_leave_days && (
                  <p className="mt-1 text-sm text-red-600">{errors.annual_leave_days.message}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="sick_leave_days"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Sick Leave Days
                </label>
                <input
                  type="number"
                  id="sick_leave_days"
                  {...register('sick_leave_days')}
                  className={`
                    block w-full px-3 py-2 border rounded-md shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    ${errors.sick_leave_days ? 'border-red-300' : 'border-gray-300'}
                  `}
                />
                {errors.sick_leave_days && (
                  <p className="mt-1 text-sm text-red-600">{errors.sick_leave_days.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Attendance Settings */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center space-x-3 mb-6">
              <Clock className="text-blue-600" size={24} />
              <h2 className="text-lg font-semibold text-gray-900">Attendance Settings</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register('enable_attendance_tracking')}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Enable attendance tracking
                  </span>
                </label>
              </div>

              <div>
                <label
                  htmlFor="working_hours_per_day"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Working Hours Per Day
                </label>
                <input
                  type="number"
                  step="0.5"
                  id="working_hours_per_day"
                  {...register('working_hours_per_day')}
                  className={`
                    block w-full px-3 py-2 border rounded-md shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    ${errors.working_hours_per_day ? 'border-red-300' : 'border-gray-300'}
                  `}
                />
                {errors.working_hours_per_day && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.working_hours_per_day.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="late_arrival_grace_minutes"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Late Arrival Grace Period (minutes)
                </label>
                <input
                  type="number"
                  id="late_arrival_grace_minutes"
                  {...register('late_arrival_grace_minutes')}
                  className={`
                    block w-full px-3 py-2 border rounded-md shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    ${errors.late_arrival_grace_minutes ? 'border-red-300' : 'border-gray-300'}
                  `}
                />
                {errors.late_arrival_grace_minutes && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.late_arrival_grace_minutes.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Payroll Settings */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center space-x-3 mb-6">
              <DollarSign className="text-purple-600" size={24} />
              <h2 className="text-lg font-semibold text-gray-900">Payroll Settings</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label
                  htmlFor="payroll_currency"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Payroll Currency
                </label>
                <select
                  id="payroll_currency"
                  {...register('payroll_currency')}
                  className={`
                    block w-full px-3 py-2 border rounded-md shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    ${errors.payroll_currency ? 'border-red-300' : 'border-gray-300'}
                  `}
                >
                  <option value="USD">USD - US Dollar</option>
                  <option value="NGN">NGN - Nigerian Naira</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="EUR">EUR - Euro</option>
                </select>
                {errors.payroll_currency && (
                  <p className="mt-1 text-sm text-red-600">{errors.payroll_currency.message}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="payroll_frequency"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Payroll Frequency
                </label>
                <select
                  id="payroll_frequency"
                  {...register('payroll_frequency')}
                  className={`
                    block w-full px-3 py-2 border rounded-md shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    ${errors.payroll_frequency ? 'border-red-300' : 'border-gray-300'}
                  `}
                >
                  <option value="monthly">Monthly</option>
                  <option value="bi_weekly">Bi-weekly</option>
                  <option value="weekly">Weekly</option>
                </select>
                {errors.payroll_frequency && (
                  <p className="mt-1 text-sm text-red-600">{errors.payroll_frequency.message}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="tax_rate_percentage"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Tax Rate Percentage
                </label>
                <input
                  type="number"
                  step="0.01"
                  id="tax_rate_percentage"
                  {...register('tax_rate_percentage')}
                  className={`
                    block w-full px-3 py-2 border rounded-md shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    ${errors.tax_rate_percentage ? 'border-red-300' : 'border-gray-300'}
                  `}
                />
                {errors.tax_rate_percentage && (
                  <p className="mt-1 text-sm text-red-600">{errors.tax_rate_percentage.message}</p>
                )}
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register('enable_overtime_calculation')}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Enable overtime calculation
                  </span>
                </label>
              </div>

              {watch('enable_overtime_calculation') && (
                <div>
                  <label
                    htmlFor="overtime_multiplier"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Overtime Multiplier
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    id="overtime_multiplier"
                    {...register('overtime_multiplier')}
                    className={`
                      block w-full px-3 py-2 border rounded-md shadow-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      ${errors.overtime_multiplier ? 'border-red-300' : 'border-gray-300'}
                    `}
                  />
                  {errors.overtime_multiplier && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.overtime_multiplier.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Staff ID Configuration */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center space-x-3 mb-6">
              <BadgeCheck className="text-indigo-600" size={24} />
              <h2 className="text-lg font-semibold text-gray-900">Staff ID Configuration</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label
                  htmlFor="staff_id_prefix"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  ID Prefix
                </label>
                <input
                  type="text"
                  id="staff_id_prefix"
                  {...register('staff_id_prefix')}
                  placeholder="e.g. MML"
                  className={`
                    block w-full px-3 py-2 border rounded-md shadow-sm uppercase
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                    ${errors.staff_id_prefix ? 'border-red-300' : 'border-gray-300'}
                  `}
                />
                {errors.staff_id_prefix && (
                  <p className="mt-1 text-sm text-red-600">{errors.staff_id_prefix.message}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Letters/numbers only. Used as the start of each staff ID.
                </p>
              </div>

              <div>
                <label
                  htmlFor="staff_id_padding"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Number of Digits
                </label>
                <input
                  type="number"
                  id="staff_id_padding"
                  min={2}
                  max={6}
                  {...register('staff_id_padding')}
                  className={`
                    block w-full px-3 py-2 border rounded-md shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                    ${errors.staff_id_padding ? 'border-red-300' : 'border-gray-300'}
                  `}
                />
                {errors.staff_id_padding && (
                  <p className="mt-1 text-sm text-red-600">{errors.staff_id_padding.message}</p>
                )}
              </div>

              <div className="col-span-2">
                <div className="bg-indigo-50 border border-indigo-200 rounded-md p-3">
                  <p className="text-sm font-medium text-indigo-800">Preview:</p>
                  <p className="text-lg font-bold text-indigo-900 mt-1 font-mono">
                    {(watch('staff_id_prefix') || 'STF').toUpperCase()}
                    {'1'.padStart(watch('staff_id_padding') || 3, '0')}
                  </p>
                  <p className="text-xs text-indigo-600 mt-1">
                    This is what the first staff ID will look like.
                  </p>
                </div>
              </div>

              {config?.staff_id_current_number !== undefined && (
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">
                    Current counter: <strong>{config.staff_id_current_number}</strong> staff
                    registered under this branch.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Pension Configuration */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center space-x-3 mb-6">
              <Shield className="text-emerald-600" size={24} />
              <h2 className="text-lg font-semibold text-gray-900">Pension Configuration</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register('enable_pension')}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Enable pension deductions on payroll
                  </span>
                </label>
              </div>

              {watch('enable_pension') && (
                <>
                  <div>
                    <label
                      htmlFor="employee_pension_rate"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Employee Contribution Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="employee_pension_rate"
                      {...register('employee_pension_rate')}
                      className={`
                        block w-full px-3 py-2 border rounded-md shadow-sm
                        focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500
                        ${errors.employee_pension_rate ? 'border-red-300' : 'border-gray-300'}
                      `}
                    />
                    {errors.employee_pension_rate && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.employee_pension_rate.message}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Deducted from employee gross salary (DR Salary, CR Employee Pension Payable).
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="employer_pension_rate"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Employer Contribution Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="employer_pension_rate"
                      {...register('employer_pension_rate')}
                      className={`
                        block w-full px-3 py-2 border rounded-md shadow-sm
                        focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500
                        ${errors.employer_pension_rate ? 'border-red-300' : 'border-gray-300'}
                      `}
                    />
                    {errors.employer_pension_rate && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.employer_pension_rate.message}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Separate employer expense (DR Pension Expense, CR Employer Pension Payable).
                    </p>
                  </div>

                  <div className="col-span-2">
                    <label
                      htmlFor="pension_provider_name"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Pension Fund Provider Name
                    </label>
                    <input
                      type="text"
                      id="pension_provider_name"
                      {...register('pension_provider_name')}
                      placeholder="e.g. NLPC Pension Fund"
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>

                  <div className="col-span-2">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm">
                      <p className="font-medium text-emerald-800 mb-1">
                        Accounting entries on payroll approval:
                      </p>
                      <ul className="text-emerald-700 space-y-0.5">
                        <li>
                          DR Salary Expense | CR Employee Pension Payable (
                          {watch('employee_pension_rate') || 8}%) + CR Tax + CR Salary Payable
                        </li>
                        <li>
                          DR Pension Expense ({watch('employer_pension_rate') || 10}%) | CR Employer
                          Pension Payable
                        </li>
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* PAYE / Tax Configuration (Nigeria Tax Act 2024) */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center space-x-3 mb-2">
              <span className="text-xl">🏛</span>
              <h2 className="text-lg font-semibold text-gray-900">
                PAYE &amp; Tax (Nigeria Tax Act 2024)
              </h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Automatic PAYE is computed on the graduated NTA 2024 bands. The old CRA has been
              abolished — no manual relief allowance is needed.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PAYE toggle */}
              <div className="col-span-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register('enable_paye')}
                    className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Enable automatic PAYE calculation
                  </span>
                </label>
                <p className="mt-1 ml-6 text-xs text-gray-500">
                  Uses the NTA 2024 graduated bands: 0% / 15% / 18% / 21% / 23% / 25%. Disable only
                  if you manage PAYE manually.
                </p>
              </div>

              {watch('enable_paye') && (
                <div className="col-span-2">
                  <div className="overflow-x-auto rounded-lg border border-orange-200">
                    <table className="w-full text-xs">
                      <thead className="bg-orange-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-orange-800">
                            Annual Income Band
                          </th>
                          <th className="px-3 py-2 text-right font-semibold text-orange-800">
                            Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-orange-100">
                        {[
                          { band: 'First ₦800,000', rate: '0%', note: 'Minimum wage relief' },
                          { band: 'Next ₦2,200,000 (up to ₦3M)', rate: '15%', note: '' },
                          { band: 'Next ₦9,000,000 (up to ₦12M)', rate: '18%', note: '' },
                          { band: 'Next ₦13,000,000 (up to ₦25M)', rate: '21%', note: '' },
                          { band: 'Next ₦25,000,000 (up to ₦50M)', rate: '23%', note: '' },
                          { band: 'Balance above ₦50M', rate: '25%', note: '' },
                        ].map(row => (
                          <tr key={row.band} className="bg-white">
                            <td className="px-3 py-2 text-gray-700">
                              {row.band}{' '}
                              {row.note && (
                                <span className="text-gray-400 italic">— {row.note}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-orange-700">
                              {row.rate}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    Monthly PAYE = Annual PAYE ÷ 12. Full band-level audit trail is stored on each
                    payslip.
                  </p>
                </div>
              )}

              {/* Development Levy */}
              <div className="col-span-2 border-t pt-5 mt-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register('enable_development_levy')}
                    className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Enable Development Levy deduction
                  </span>
                </label>
                <p className="mt-1 ml-6 text-xs text-gray-500">
                  NTA 2024 Third Schedule, Part II — flat annual levy per employee (default
                  ₦1,000/year = ₦83.33/month).
                </p>
              </div>

              {watch('enable_development_levy') && (
                <div>
                  <label
                    htmlFor="development_levy_annual_amount"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Annual Development Levy Amount (₦)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    id="development_levy_annual_amount"
                    {...register('development_levy_annual_amount')}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${errors.development_levy_annual_amount ? 'border-red-300' : 'border-gray-300'}`}
                  />
                  {errors.development_levy_annual_amount && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.development_levy_annual_amount.message}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Monthly deduction = ₦
                    {((watch('development_levy_annual_amount') || 1000) / 12).toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Workflow Settings */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center space-x-3 mb-6">
              <Users className="text-orange-600" size={24} />
              <h2 className="text-lg font-semibold text-gray-900">Workflow Settings</h2>
            </div>

            <div className="space-y-6">
              <WorkflowSelector
                label="Default Leave Workflow"
                name="default_leave_workflow"
                value={watch('default_leave_workflow')}
                onChange={value => setValue('default_leave_workflow', value)}
                workflows={workflows}
                description="Workflow used for standard leave requests (within consecutive days limit)"
                error={errors.default_leave_workflow?.message}
              />

              <WorkflowSelector
                label="Extended Leave Workflow"
                name="extended_leave_workflow"
                value={watch('extended_leave_workflow')}
                onChange={value => setValue('extended_leave_workflow', value)}
                workflows={workflows}
                description="Workflow used for extended leave requests (exceeding consecutive days limit)"
                error={errors.extended_leave_workflow?.message}
              />

              <WorkflowSelector
                label="Payroll Approval Workflow"
                name="payroll_approval_workflow"
                value={watch('payroll_approval_workflow')}
                onChange={value => setValue('payroll_approval_workflow', value)}
                workflows={workflows}
                description="Workflow used for payroll approval process"
                error={errors.payroll_approval_workflow?.message}
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default HRConfigPage;
