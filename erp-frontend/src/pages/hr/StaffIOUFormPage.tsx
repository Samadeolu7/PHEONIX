import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Save,
  User,
  Banknote,
  Calendar,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../../hooks/useToast';
import { useCreateStaffIOU } from '../../hooks/useStaffIOU';
import { hrService } from '../../services/hrService';
import { Breadcrumb } from '../../components/ui/Breadcrumb';

const schema = z
  .object({
    staff: z.number({ required_error: 'Staff member is required' }).min(1, 'Select a staff member'),
    total_amount: z
      .number({ required_error: 'Total amount is required' })
      .min(1, 'Total amount must be greater than 0'),
    monthly_installment: z
      .number({ required_error: 'Monthly installment is required' })
      .min(1, 'Monthly installment must be greater than 0'),
    start_month: z.string({ required_error: 'Start month is required' }).min(1, 'Select start month'),
    reason: z
      .string({ required_error: 'Reason is required' })
      .min(10, 'Reason must be at least 10 characters'),
    notes: z.string().optional(),
  })
  .refine(data => data.monthly_installment <= data.total_amount, {
    message: 'Monthly installment cannot exceed total amount',
    path: ['monthly_installment'],
  });

type FormData = z.infer<typeof schema>;

const StaffIOUFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const createMutation = useCreateStaffIOU();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      staff: 0,
      total_amount: 0,
      monthly_installment: 0,
      start_month: '',
      reason: '',
      notes: '',
    },
  });

  const {
    data: staffData,
    isLoading: isLoadingStaff,
    isError: isStaffError,
    refetch: refetchStaff,
  } = useQuery({
    queryKey: ['staff-dropdown'],
    queryFn: () => hrService.getStaffForDropdown(),
  });

  const onInvalid = (fieldErrors: Record<string, any>) => {
    const first = Object.values(fieldErrors)[0];
    const msg = first?.message || 'Please fix the errors below before submitting.';
    showError(msg);
  };

  const onSubmit = async (data: FormData) => {
    try {
      const startMonthDate = data.start_month.length === 7
        ? `${data.start_month}-01`
        : data.start_month;

      await createMutation.mutateAsync({
        staff: data.staff,
        total_amount: data.total_amount,
        monthly_installment: data.monthly_installment,
        start_month: startMonthDate,
        reason: data.reason,
        notes: data.notes || '',
      });

      success('Staff IOU created. Approve it and record the origin (cash given or non-cash obligation) from the list page.');
      navigate('/hr/ious');
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
          : nonFieldMsg || err?.message || details?.detail || 'Failed to create Staff IOU. Please try again.';
      showError(message);
    }
  };

  const isBusy = isSubmitting || createMutation.isPending;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Breadcrumb
        items={[
          { label: 'HR & Payroll', href: '/hr' },
          { label: 'Staff IOU', href: '/hr/ious' },
          { label: 'New IOU', href: '/hr/ious/create' },
        ]}
      />

      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          title="Go back"
          className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Staff IOU</h1>
          <p className="text-sm text-gray-500">
            Create a cash advance recovered via fixed monthly payroll deductions
          </p>
        </div>
      </div>

      {/* Accounting info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2 text-sm text-blue-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Two-step workflow:</strong> After creating, this IOU will need to be{' '}
            <strong>approved</strong> by a manager. Upon approval you will record the origin of
            the debt — either the staff received cash (which posts a GL entry: Dr Staff Loan Account
            / Cr Bank or Petty Cash), or the obligation arose from a non-cash transaction (e.g.
            asset disposal, damage recovery) and repayment will be deducted from payroll only.
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        {/* Staff */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="flex items-center gap-1">
              <User className="w-4 h-4" />
              Staff Member <span className="text-red-500">*</span>
            </span>
          </label>
          <Controller
            name="staff"
            control={control}
            render={({ field }) => (
              <select
                {...field}
                disabled={isStaffError}
                onChange={e => field.onChange(Number(e.target.value))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.staff ? 'border-red-400' : 'border-gray-300'
                }`}
              >
                <option value={0}>
                  {isLoadingStaff
                    ? 'Loading staff…'
                    : isStaffError
                      ? 'Failed to load staff list'
                      : staffData && staffData.length === 0
                        ? 'No staff found'
                        : 'Select staff member'}
                </option>
                {staffData?.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.department ? ` (${s.department})` : ''}
                  </option>
                ))}
              </select>
            )}
          />
          {isStaffError && (
            <p className="mt-1 text-xs text-red-500">
              Could not load the staff list.{' '}
              <button
                type="button"
                onClick={() => refetchStaff()}
                className="underline hover:text-red-600"
              >
                Retry
              </button>
            </p>
          )}
          {errors.staff && (
            <p className="mt-1 text-xs text-red-500">{errors.staff.message}</p>
          )}
        </div>

        {/* Amounts row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="flex items-center gap-1">
                <Banknote className="w-4 h-4" />
                Total IOU Amount (₦) <span className="text-red-500">*</span>
              </span>
            </label>
            <Controller
              name="total_amount"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  type="number"
                  min={1}
                  step="0.01"
                  onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.total_amount ? 'border-red-400' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                />
              )}
            />
            {errors.total_amount && (
              <p className="mt-1 text-xs text-red-500">{errors.total_amount.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="flex items-center gap-1">
                <Banknote className="w-4 h-4" />
                Monthly Installment (₦) <span className="text-red-500">*</span>
              </span>
            </label>
            <Controller
              name="monthly_installment"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  type="number"
                  min={1}
                  step="0.01"
                  onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.monthly_installment ? 'border-red-400' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                />
              )}
            />
            {errors.monthly_installment && (
              <p className="mt-1 text-xs text-red-500">{errors.monthly_installment.message}</p>
            )}
          </div>
        </div>

        {/* Start Month */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Start Month <span className="text-red-500">*</span>
            </span>
          </label>
          <Controller
            name="start_month"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                type="month"
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.start_month ? 'border-red-400' : 'border-gray-300'
                }`}
              />
            )}
          />
          {errors.start_month && (
            <p className="mt-1 text-xs text-red-500">{errors.start_month.message}</p>
          )}
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              Reason <span className="text-red-500">*</span>
            </span>
          </label>
          <Controller
            name="reason"
            control={control}
            render={({ field }) => (
              <textarea
                {...field}
                rows={3}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
                  errors.reason ? 'border-red-400' : 'border-gray-300'
                }`}
                placeholder="Reason for the IOU / cash advance…"
              />
            )}
          />
          {errors.reason && (
            <p className="mt-1 text-xs text-red-500">{errors.reason.message}</p>
          )}
        </div>

        {/* Notes (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes (optional)
          </label>
          <Controller
            name="notes"
            control={control}
            render={({ field }) => (
              <textarea
                {...field}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Any additional notes…"
              />
            )}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={() => navigate('/hr/ious')}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isBusy}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isBusy ? 'Saving…' : 'Create IOU'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StaffIOUFormPage;
