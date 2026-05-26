// Payslip Summary Component - Payslip summary card
import React from 'react';
import { User, DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { Payslip } from '../../types/hr';

interface PayslipSummaryProps {
  payslip: Payslip;
  onClick?: () => void;
  className?: string;
}

export const PayslipSummary: React.FC<PayslipSummaryProps> = ({
  payslip,
  onClick,
  className = '',
}) => {
  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(amount));
  };

  const formatDecimal = (value: string) => {
    return parseFloat(value).toFixed(1);
  };

  const calculateEffectiveRate = () => {
    const daysWorked = payslip.days_worked ? parseFloat(payslip.days_worked) : 0;
    const basicSalary = parseFloat(payslip.basic_salary);

    if (daysWorked === 0) return 0;

    // Assuming a standard month has ~22 working days
    const standardWorkingDays = 22;
    return (basicSalary / standardWorkingDays) * daysWorked;
  };

  return (
    <div
      className={`
        bg-white border border-gray-200 rounded-lg p-4 shadow-sm
        ${onClick ? 'cursor-pointer hover:border-gray-300 hover:shadow-md transition-all duration-200' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-900">{payslip.staff_name}</h4>
            <p className="text-xs text-gray-500">#{payslip.payslip_number}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-purple-600">{formatCurrency(payslip.net_pay)}</p>
          <p className="text-xs text-gray-500">Net Pay</p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <DollarSign className="h-3 w-3 text-green-600" />
          </div>
          <p className="text-xs text-gray-500">Gross</p>
          <p className="text-sm font-semibold text-gray-900">{formatCurrency(payslip.gross_pay)}</p>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <DollarSign className="h-3 w-3 text-red-600" />
          </div>
          <p className="text-xs text-gray-500">Deductions</p>
          <p className="text-sm font-semibold text-red-600">
            -{formatCurrency(payslip.total_deductions)}
          </p>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <Calendar className="h-3 w-3 text-blue-600" />
          </div>
          <p className="text-xs text-gray-500">Days Worked</p>
          <p className="text-sm font-semibold text-gray-900">
            {payslip.days_worked ? formatDecimal(payslip.days_worked) : '0'}
          </p>
        </div>
      </div>

      {/* Additional Info */}
      <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
        <div className="flex items-center space-x-3">
          {payslip.overtime_hours && parseFloat(payslip.overtime_hours) > 0 && (
            <span className="flex items-center">
              <TrendingUp className="h-3 w-3 mr-1 text-orange-500" />
              {formatDecimal(payslip.overtime_hours)}h OT
            </span>
          )}

          {payslip.days_absent && parseFloat(payslip.days_absent) > 0 && (
            <span className="text-red-500">{formatDecimal(payslip.days_absent)} absent</span>
          )}

          {payslip.days_on_leave && parseFloat(payslip.days_on_leave) > 0 && (
            <span className="text-blue-500">{formatDecimal(payslip.days_on_leave)} leave</span>
          )}
        </div>

        <div className="text-right">
          <span>Staff #{payslip.staff_number}</span>
        </div>
      </div>

      {/* Bonus/Allowance Indicators */}
      {((payslip.bonuses && parseFloat(payslip.bonuses) > 0) ||
        (payslip.allowances && Object.keys(payslip.allowances).length > 0)) && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              {payslip.bonuses && parseFloat(payslip.bonuses) > 0 && (
                <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  Bonus: {formatCurrency(payslip.bonuses)}
                </span>
              )}

              {payslip.allowances && Object.keys(payslip.allowances).length > 0 && (
                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                  {Object.keys(payslip.allowances).length} allowance(s)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status Indicators */}
      <div className="mt-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          {payslip.pdf_file && <span className="text-green-600">PDF Available</span>}

          {payslip.emailed_at && (
            <span className="text-blue-600">
              Emailed {new Date(payslip.emailed_at).toLocaleDateString()}
            </span>
          )}
        </div>

        <span className="text-gray-500">{new Date(payslip.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
};
