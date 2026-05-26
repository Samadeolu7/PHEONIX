// Payslip Card Component - Individual payslip display
import React from 'react';
import { Download, User, DollarSign, Clock, FileText } from 'lucide-react';
import { Payslip } from '../../types/hr';

interface PayslipCardProps {
  payslip: Payslip;
  onDownload?: () => void;
  onView?: () => void;
}

/** Resolve amount from new {amount, is_taxable} format OR legacy plain number/string */
const resolveAmount = (value: unknown): number => {
  if (typeof value === 'object' && value !== null && 'amount' in value) {
    return parseFloat(String((value as { amount: unknown }).amount));
  }
  return parseFloat(String(value));
};

export const PayslipCard: React.FC<PayslipCardProps> = ({ payslip, onDownload, onView }) => {
  const formatCurrency = (amount: string | number) => {
    const n = typeof amount === 'number' ? amount : parseFloat(amount);
    if (isNaN(n)) return '₦0.00';
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(n);
  };

  const formatDecimal = (value: string) => {
    return parseFloat(value).toFixed(2);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors duration-200">
      <div className="flex items-start justify-between">
        {/* Employee Info */}
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="h-5 w-5 text-blue-600" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-gray-900 truncate">{payslip.staff_name}</h4>
            <p className="text-sm text-gray-500">
              Staff #{payslip.staff_id} • Payslip #{payslip.payslip_number}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          {onView && (
            <button
              onClick={onView}
              className="text-blue-600 hover:text-blue-800 p-1"
              title="View Details"
            >
              <FileText className="h-4 w-4" />
            </button>
          )}
          {onDownload && (
            <button
              onClick={onDownload}
              className="text-green-600 hover:text-green-800 p-1"
              title="Download Payslip"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Financial Summary */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <DollarSign className="h-4 w-4 text-green-600" />
          </div>
          <p className="text-xs text-gray-500">Basic Salary</p>
          <p className="text-sm font-semibold text-gray-900">
            {formatCurrency(payslip.basic_salary)}
          </p>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <DollarSign className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-xs text-gray-500">Gross Pay</p>
          <p className="text-sm font-semibold text-gray-900">{formatCurrency(payslip.gross_pay)}</p>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <DollarSign className="h-4 w-4 text-red-600" />
          </div>
          <p className="text-xs text-gray-500">Deductions</p>
          <p className="text-sm font-semibold text-red-600">
            -{formatCurrency(payslip.total_deductions)}
          </p>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <DollarSign className="h-4 w-4 text-purple-600" />
          </div>
          <p className="text-xs text-gray-500">Net Pay</p>
          <p className="text-sm font-semibold text-purple-600">{formatCurrency(payslip.net_pay)}</p>
        </div>
      </div>

      {/* Work Summary */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="flex items-center">
            <Clock className="h-3 w-3 text-gray-400 mr-1" />
            <span className="text-gray-500">Days Worked:</span>
            <span className="ml-1 font-medium text-gray-900">
              {payslip.days_worked ? formatDecimal(payslip.days_worked) : '0'}
            </span>
          </div>

          <div className="flex items-center">
            <Clock className="h-3 w-3 text-gray-400 mr-1" />
            <span className="text-gray-500">Days Absent:</span>
            <span className="ml-1 font-medium text-gray-900">
              {payslip.days_absent ? formatDecimal(payslip.days_absent) : '0'}
            </span>
          </div>

          <div className="flex items-center">
            <Clock className="h-3 w-3 text-gray-400 mr-1" />
            <span className="text-gray-500">Days on Leave:</span>
            <span className="ml-1 font-medium text-gray-900">
              {payslip.days_on_leave ? formatDecimal(payslip.days_on_leave) : '0'}
            </span>
          </div>

          <div className="flex items-center">
            <Clock className="h-3 w-3 text-gray-400 mr-1" />
            <span className="text-gray-500">Overtime Hours:</span>
            <span className="ml-1 font-medium text-gray-900">
              {payslip.overtime_hours ? formatDecimal(payslip.overtime_hours) : '0'}
            </span>
          </div>
        </div>
      </div>

      {/* Additional Components */}
      {payslip.overtime_pay && parseFloat(payslip.overtime_pay) > 0 && (
        <div className="mt-2 text-xs text-orange-600">
          Overtime Pay: {formatCurrency(payslip.overtime_pay)}
        </div>
      )}

      {payslip.bonuses && parseFloat(payslip.bonuses) > 0 && (
        <div className="mt-1 text-xs text-green-600">
          Bonuses: {formatCurrency(payslip.bonuses)}
        </div>
      )}

      {payslip.emailed_at && (
        <div className="mt-2 text-xs text-gray-500">
          Emailed: {new Date(payslip.emailed_at).toLocaleDateString()}
        </div>
      )}

      {/* Allowances and Deductions Details */}
      {(payslip.allowances || payslip.deductions) && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {payslip.allowances && Object.keys(payslip.allowances).length > 0 && (
              <div>
                <p className="font-medium text-gray-700 mb-1">Allowances:</p>
                <div className="space-y-1">
                  {Object.entries(payslip.allowances).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-500 capitalize">{key.replace('_', ' ')}:</span>
                      <span className="text-green-600">
                        +{formatCurrency(resolveAmount(value))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(payslip.deductions && Object.keys(payslip.deductions).length > 0) ||
            parseFloat(payslip.employee_pension || '0') > 0 ? (
              <div>
                <p className="font-medium text-gray-700 mb-1">Deductions:</p>
                <div className="space-y-1">
                  {payslip.tax && parseFloat(payslip.tax) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">PAYE Tax:</span>
                      <span className="text-red-600">-{formatCurrency(payslip.tax)}</span>
                    </div>
                  )}
                  {parseFloat(payslip.employee_pension || '0') > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Employee Pension (8%):</span>
                      <span className="text-red-600">
                        -{formatCurrency(payslip.employee_pension)}
                      </span>
                    </div>
                  )}
                  {payslip.deductions &&
                    Object.entries(payslip.deductions).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-500 capitalize">{key.replace('_', ' ')}:</span>
                        <span className="text-red-600">-{formatCurrency(String(value))}</span>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {parseFloat(payslip.employer_pension || '0') > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Employer Pension (10% — not deducted):</span>
            <span>{formatCurrency(payslip.employer_pension)}</span>
          </div>
        </div>
      )}
    </div>
  );
};
