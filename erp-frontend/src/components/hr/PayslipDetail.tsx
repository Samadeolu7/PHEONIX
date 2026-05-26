// Payslip Detail Component - Detailed payslip view
import React from 'react';
import { Download, User, Calendar, DollarSign, FileText, Building } from 'lucide-react';
import { Payslip } from '../../types/hr';

interface PayslipDetailProps {
  payslip: Payslip;
  onDownload?: () => void;
  showHeader?: boolean;
}

export const PayslipDetail: React.FC<PayslipDetailProps> = ({
  payslip,
  onDownload,
  showHeader = true,
}) => {
  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(amount));
  };

  const formatDecimal = (value: string) => {
    return parseFloat(value).toFixed(2);
  };

  return (
    <div className="bg-white">
      {/* Header */}
      {showHeader && (
        <div className="border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{payslip.staff_name}</h2>
                <p className="text-gray-600">
                  Staff #{payslip.staff_number} • Payslip #{payslip.payslip_number}
                </p>
              </div>
            </div>
            {onDownload && (
              <button
                onClick={onDownload}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center"
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </button>
            )}
          </div>
        </div>
      )}

      <div className="p-6">
        {/* Payroll Information */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Building className="h-5 w-5 mr-2" />
            Payroll Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block font-medium text-gray-500">Payroll Reference</label>
              <p className="mt-1 text-gray-900">{payslip.payroll_reference}</p>
            </div>
            <div>
              <label className="block font-medium text-gray-500">Generated</label>
              <p className="mt-1 text-gray-900">
                {new Date(payslip.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Earnings Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <DollarSign className="h-5 w-5 mr-2 text-green-600" />
            Earnings
          </h3>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700">Basic Salary</span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatCurrency(payslip.basic_salary)}
                </span>
              </div>

              {payslip.overtime_pay && parseFloat(payslip.overtime_pay) > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    Overtime Pay (
                    {payslip.overtime_hours ? formatDecimal(payslip.overtime_hours) : '0'} hours)
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(payslip.overtime_pay)}
                  </span>
                </div>
              )}

              {payslip.bonuses && parseFloat(payslip.bonuses) > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-700">Bonuses</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(payslip.bonuses)}
                  </span>
                </div>
              )}

              {/* Allowances */}
              {payslip.allowances && Object.keys(payslip.allowances).length > 0 && (
                <>
                  <div className="border-t border-green-300 pt-3 mt-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">Allowances:</p>
                    {Object.entries(payslip.allowances).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-sm text-gray-600 capitalize ml-4">
                          {key.replace('_', ' ')}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {formatCurrency(String(value))}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="border-t border-green-300 pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="text-base font-semibold text-gray-900">Total Gross Pay</span>
                  <span className="text-base font-bold text-green-600">
                    {formatCurrency(payslip.gross_pay)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Deductions Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <DollarSign className="h-5 w-5 mr-2 text-red-600" />
            Deductions
          </h3>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="space-y-3">
              {payslip.tax && parseFloat(payslip.tax) > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-700">Income Tax</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(payslip.tax)}
                  </span>
                </div>
              )}

              {/* Other Deductions */}
              {payslip.deductions && Object.keys(payslip.deductions).length > 0 && (
                <>
                  {Object.entries(payslip.deductions).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-sm font-medium text-gray-700 capitalize">
                        {key.replace('_', ' ')}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCurrency(String(value))}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {(!payslip.tax || parseFloat(payslip.tax) === 0) &&
                (!payslip.deductions || Object.keys(payslip.deductions).length === 0) && (
                  <div className="text-sm text-gray-500 text-center py-2">
                    No deductions for this period
                  </div>
                )}

              <div className="border-t border-red-300 pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="text-base font-semibold text-gray-900">Total Deductions</span>
                  <span className="text-base font-bold text-red-600">
                    -{formatCurrency(payslip.total_deductions)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Net Pay Section */}
        <div className="mb-6">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-lg font-bold text-gray-900">Net Pay</span>
              <span className="text-2xl font-bold text-purple-600">
                {formatCurrency(payslip.net_pay)}
              </span>
            </div>
          </div>
        </div>

        {/* Work Summary */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Work Summary
          </h3>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {payslip.days_worked ? formatDecimal(payslip.days_worked) : '0'}
                </p>
                <p className="text-sm text-gray-600">Days Worked</p>
              </div>

              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">
                  {payslip.days_absent ? formatDecimal(payslip.days_absent) : '0'}
                </p>
                <p className="text-sm text-gray-600">Days Absent</p>
              </div>

              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {payslip.days_on_leave ? formatDecimal(payslip.days_on_leave) : '0'}
                </p>
                <p className="text-sm text-gray-600">Days on Leave</p>
              </div>

              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">
                  {payslip.overtime_hours ? formatDecimal(payslip.overtime_hours) : '0'}
                </p>
                <p className="text-sm text-gray-600">Overtime Hours</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Information */}
        <div className="border-t border-gray-200 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <p>
                <strong>Generated:</strong> {new Date(payslip.created_at).toLocaleString()}
              </p>
              <p>
                <strong>Last Updated:</strong> {new Date(payslip.updated_at).toLocaleString()}
              </p>
            </div>
            <div>
              {payslip.emailed_at && (
                <p>
                  <strong>Emailed:</strong> {new Date(payslip.emailed_at).toLocaleString()}
                </p>
              )}
              {payslip.pdf_file && (
                <p>
                  <strong>PDF Available:</strong> Yes
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
