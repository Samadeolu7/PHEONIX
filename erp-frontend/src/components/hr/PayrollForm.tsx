// Payroll Form Component - Payroll creation form
import React from 'react';
import { Calendar, FileText, AlertCircle } from 'lucide-react';
import { PayrollStatusBadge } from './PayrollStatusBadge';
import { CreatePayrollData, PayrollStatus, getPayrollStatusLabel } from '../../types/hr';

interface PayrollFormProps {
  formData: CreatePayrollData;
  errors: Record<string, string>;
  onChange: (field: keyof CreatePayrollData, value: any) => void;
  loading?: boolean;
  isEdit?: boolean;
}

export const PayrollForm: React.FC<PayrollFormProps> = ({
  formData,
  errors,
  onChange,
  loading = false,
  isEdit = false,
}) => {
  const statusOptions = [
    PayrollStatus.DRAFT,
    PayrollStatus.CALCULATED,
    PayrollStatus.APPROVED,
    PayrollStatus.PAID,
    PayrollStatus.CANCELLED,
  ];

  const calculatePeriodInfo = () => {
    if (!formData.period_start || !formData.period_end) return null;

    const start = new Date(formData.period_start);
    const end = new Date(formData.period_end);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const startMonth = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return {
      days: diffDays,
      startMonth,
      endMonth,
      sameMonth: startMonth === endMonth,
    };
  };

  const periodInfo = calculatePeriodInfo();

  return (
    <div className="space-y-6">
      {/* Period Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Period Start */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="h-4 w-4 inline mr-1" />
            Period Start Date *
          </label>
          <input
            type="date"
            value={formData.period_start}
            onChange={e => onChange('period_start', e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.period_start ? 'border-red-300' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {errors.period_start && (
            <p className="mt-1 text-sm text-red-600">{errors.period_start}</p>
          )}
        </div>

        {/* Period End */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="h-4 w-4 inline mr-1" />
            Period End Date *
          </label>
          <input
            type="date"
            value={formData.period_end}
            onChange={e => onChange('period_end', e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.period_end ? 'border-red-300' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {errors.period_end && <p className="mt-1 text-sm text-red-600">{errors.period_end}</p>}
        </div>
      </div>

      {/* Pay Date */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="h-4 w-4 inline mr-1" />
            Pay Date *
          </label>
          <input
            type="date"
            value={formData.pay_date}
            onChange={e => onChange('pay_date', e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.pay_date ? 'border-red-300' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {errors.pay_date && <p className="mt-1 text-sm text-red-600">{errors.pay_date}</p>}
          <p className="mt-1 text-xs text-gray-500">Date when employees will receive their pay</p>
        </div>

        {/* Status (only for editing) */}
        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={formData.status || PayrollStatus.DRAFT}
              onChange={e => onChange('status', e.target.value as PayrollStatus)}
              className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.status ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={loading}
            >
              {statusOptions.map(status => (
                <option key={status} value={status}>
                  {getPayrollStatusLabel(status)}
                </option>
              ))}
            </select>
            {formData.status && (
              <div className="mt-2">
                <PayrollStatusBadge status={formData.status} size="sm" />
              </div>
            )}
            {errors.status && <p className="mt-1 text-sm text-red-600">{errors.status}</p>}
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <FileText className="h-4 w-4 inline mr-1" />
          Notes
        </label>
        <textarea
          value={formData.notes || ''}
          onChange={e => onChange('notes', e.target.value)}
          rows={3}
          className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            errors.notes ? 'border-red-300' : 'border-gray-300'
          }`}
          placeholder="Additional notes about this payroll period..."
          disabled={loading}
        />
        {errors.notes && <p className="mt-1 text-sm text-red-600">{errors.notes}</p>}
      </div>

      {/* Period Information Display */}
      {periodInfo && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Period Information</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-blue-700 font-medium">Duration:</span>
              <p className="text-blue-900">{periodInfo.days} days</p>
            </div>
            <div>
              <span className="text-blue-700 font-medium">Period:</span>
              <p className="text-blue-900">
                {periodInfo.sameMonth
                  ? periodInfo.startMonth
                  : `${periodInfo.startMonth} - ${periodInfo.endMonth}`}
              </p>
            </div>
            <div>
              <span className="text-blue-700 font-medium">Start:</span>
              <p className="text-blue-900">
                {new Date(formData.period_start).toLocaleDateString()}
              </p>
            </div>
            <div>
              <span className="text-blue-700 font-medium">End:</span>
              <p className="text-blue-900">{new Date(formData.period_end).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Validation Warnings */}
      {formData.period_end &&
        formData.pay_date &&
        new Date(formData.pay_date) < new Date(formData.period_end) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
              <h4 className="text-sm font-medium text-yellow-900">Pay Date Warning</h4>
            </div>
            <p className="mt-2 text-sm text-yellow-800">
              The pay date is before the period end date. This is unusual as employees typically get
              paid after the work period is complete. Please verify this is correct.
            </p>
          </div>
        )}

      {/* Status-specific Information */}
      {isEdit && formData.status !== PayrollStatus.DRAFT && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-amber-600 mr-2" />
            <h4 className="text-sm font-medium text-amber-900">Status Information</h4>
          </div>
          <div className="mt-2 text-sm text-amber-800">
            {formData.status === PayrollStatus.CALCULATED && (
              <p>
                This payroll has been calculated. Payslips have been generated and are ready for
                approval.
              </p>
            )}
            {formData.status === PayrollStatus.APPROVED && (
              <p>
                This payroll has been approved and is ready for processing. Once processed, payments
                will be made.
              </p>
            )}
            {formData.status === PayrollStatus.PAID && (
              <p>This payroll has been processed and payments have been made to employees.</p>
            )}
            {formData.status === PayrollStatus.CANCELLED && (
              <p>This payroll has been cancelled and will not be processed.</p>
            )}
          </div>
        </div>
      )}

      {/* New Payroll Information */}
      {!isEdit && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-green-900 mb-2">Next Steps</h4>
          <p className="text-sm text-green-800">
            After creating this payroll period, you will be able to:
          </p>
          <ul className="mt-2 text-sm text-green-800 list-disc list-inside space-y-1">
            <li>Calculate payroll to generate individual payslips</li>
            <li>Review and approve the calculated amounts</li>
            <li>Process the payroll to initiate payments</li>
            <li>Download payslips and payment reports</li>
          </ul>
        </div>
      )}
    </div>
  );
};
