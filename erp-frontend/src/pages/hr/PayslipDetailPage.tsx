import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Mail,
  Printer,
  FileText,
  DollarSign,
  ShieldCheck,
  TrendingUp,
  Info,
  Loader2,
} from 'lucide-react';
import {
  usePayslip,
  useGeneratePayslipPDF,
  useEmailPayslip,
  useDownloadPayslipPDF,
} from '../../hooks/usePayslips';
import { useToast } from '../../hooks/useToast';
import { AllowanceValue, PAYEBandDetail, StaffIOUDetail } from '../../types/payslip';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  payslipId: number;
  staffEmail?: string;
}

const EmailModal: React.FC<EmailModalProps> = ({ isOpen, onClose, payslipId, staffEmail }) => {
  const [email, setEmail] = useState(staffEmail || '');
  const [subject, setSubject] = useState('Your Payslip');
  const [message, setMessage] = useState('Please find your payslip attached.');

  const emailMutation = useEmailPayslip();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    emailMutation.mutate(
      { id: payslipId, data: { email, subject, message } },
      { onSuccess: () => onClose() }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Email Payslip</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email-recipient"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Email Address
            </label>
            <input
              id="email-recipient"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="recipient@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="email-subject" className="block text-sm font-medium text-gray-700 mb-2">
              Subject
            </label>
            <input
              id="email-subject"
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Payslip for …"
              required
            />
          </div>

          <div>
            <label htmlFor="email-message" className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              id="email-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Please find your payslip attached."
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={emailMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Send Email
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (amount: string | number | undefined | null) => {
  if (amount === undefined || amount === null || amount === '') return '₦0.00';
  const n = parseFloat(String(amount));
  if (isNaN(n)) return '₦0.00';
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(n);
};

/** Resolve the monetary amount from both old (plain number) and new ({amount, is_taxable}) formats */
const resolveAllowanceAmount = (value: AllowanceValue): number => {
  if (typeof value === 'object' && value !== null && 'amount' in value) {
    return parseFloat(String(value.amount));
  }
  return parseFloat(String(value));
};

/** True if the allowance is taxable (defaults true for legacy flat values) */
const isAllowanceTaxable = (value: AllowanceValue): boolean => {
  if (typeof value === 'object' && value !== null && 'is_taxable' in value) {
    return value.is_taxable;
  }
  return true; // legacy: assumed taxable
};

// ────────────────────────────────────────────────────────────────────────────

const PayslipDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showEmailModal, setShowEmailModal] = useState(false);

  const { data: payslip, isLoading, error } = usePayslip(id ? parseInt(id) : 0);
  const generatePDFMutation = useGeneratePayslipPDF();
  const downloadPDFMutation = useDownloadPayslipPDF();
  const { info, dismiss } = useToast();
  const progressToastId = useRef<string>('');
  // Synchronous double-click guards (isPending is React state — async re-render gap)
  const generatingRef = useRef(false);
  const downloadingRef = useRef(false);

  const handleGeneratePDF = () => {
    if (!payslip) return;
    if (generatingRef.current) return;
    generatingRef.current = true;
    const toastId = info('Generating payslip PDF, please wait…', { duration: 0 });
    generatePDFMutation.mutate(payslip.id, {
      onSettled: () => {
        generatingRef.current = false;
        dismiss(toastId);
      },
    });
  };

  const handleDownloadPDF = () => {
    if (!payslip) return;
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    // Show a sticky progress toast immediately
    progressToastId.current = info('Generating payslip PDF, please wait…', { duration: 0 });
    downloadPDFMutation.mutate(
      { id: payslip.id, filename: `Payslip-${payslip.payslip_number}.pdf` },
      {
        onSettled: () => {
          downloadingRef.current = false;
          dismiss(progressToastId.current);
        },
      }
    );
  };

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !payslip) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-800">Failed to load payslip details</p>
      </div>
    );
  }

  const totalPAYE =
    payslip.paye_breakdown?.reduce(
      (sum: number, b: PAYEBandDetail) => sum + parseFloat(String(b.tax_in_band ?? 0)),
      0
    ) ?? parseFloat(payslip.tax || '0');

  const pensionEmployee = parseFloat(payslip.employee_pension || '0');
  const pensionEmployer = parseFloat(payslip.employer_pension || '0');
  const pensionTotal = pensionEmployee + pensionEmployer;
  const grossPay = parseFloat(payslip.gross_pay || '0');
  const taxableIncome = parseFloat(payslip.taxable_income || payslip.gross_pay || '0');
  const iouMonthlyDeduction = parseFloat(
    String(payslip.iou_monthly_deduction ?? payslip.deductions?.['Staff IOU'] ?? '0')
  );
  const otherDeductionsTotal = parseFloat(
    String(
      payslip.other_deductions_total ??
        Object.entries(payslip.deductions || {}).reduce((sum, [name, amount]) => {
          if (name === 'Staff IOU') return sum;
          return sum + (parseFloat(String(amount || 0)) || 0);
        }, 0)
    )
  );
  const iouOutstanding = parseFloat(String(payslip.iou_total_outstanding ?? '0'));
  const iouBalanceAfter = parseFloat(String(payslip.iou_balance_after_this_period ?? '0'));
  const iouDetails = (payslip.staff_iou_details || []) as StaffIOUDetail[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            aria-label="Back to payroll"
            onClick={() => navigate('/hr/payroll')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payslip Details</h1>
            <p className="text-gray-600">
              {payslip.payslip_number}
              {payslip.period_label && (
                <span className="ml-2 text-sm text-gray-400">— {payslip.period_label}</span>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleDownloadPDF}
            disabled={downloadPDFMutation.isPending}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-60 flex items-center gap-2"
          >
            {downloadPDFMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {downloadPDFMutation.isPending ? 'Generating…' : 'Download PDF'}
          </button>

          {!payslip.pdf_file && (
            <button
              onClick={handleGeneratePDF}
              disabled={generatePDFMutation.isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {generatePDFMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {generatePDFMutation.isPending ? 'Generating…' : 'Generate PDF'}
            </button>
          )}

          <button
            onClick={() => setShowEmailModal(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center gap-2"
          >
            <Mail className="h-4 w-4" />
            Email
          </button>

          <button
            onClick={handlePrint}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left / Main column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Payslip Info */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Payslip Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Staff Member</p>
                <p className="font-medium text-gray-900">{payslip.staff_name}</p>
              </div>
              <div>
                <p className="text-gray-500">Payslip Number</p>
                <p className="font-medium text-gray-900">{payslip.payslip_number}</p>
              </div>
              <div>
                <p className="text-gray-500">Payroll Reference</p>
                <p className="font-medium text-gray-900">{payslip.payroll_reference}</p>
              </div>
              <div>
                <p className="text-gray-500">Days Worked</p>
                <p className="font-medium text-gray-900">
                  {parseFloat(payslip.days_worked || '0').toFixed(1)} days
                </p>
              </div>
              {parseFloat(payslip.overtime_hours || '0') > 0 && (
                <div>
                  <p className="text-gray-500">Overtime Hours</p>
                  <p className="font-medium text-gray-900">
                    {parseFloat(payslip.overtime_hours).toFixed(1)} h
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Earnings */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="px-6 py-4 border-b bg-green-50 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-700" />
              <h3 className="text-lg font-semibold text-green-800">Earnings</h3>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 flex items-center gap-2">
                  Basic Salary
                  <span className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                    Taxable
                  </span>
                </span>
                <span className="font-medium">{fmt(payslip.basic_salary)}</span>
              </div>

              {parseFloat(payslip.overtime_pay || '0') > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 flex items-center gap-2">
                    Overtime Pay
                    <span className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                      Taxable
                    </span>
                  </span>
                  <span className="font-medium">{fmt(payslip.overtime_pay)}</span>
                </div>
              )}

              {Object.entries(payslip.allowances).map(([name, value]) => {
                const amount = resolveAllowanceAmount(value);
                const taxable = isAllowanceTaxable(value);
                return (
                  <div key={name} className="flex justify-between items-center">
                    <span className="text-gray-600 flex items-center gap-2">
                      {name}
                      {taxable ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                          Taxable
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                          Non-Taxable
                        </span>
                      )}
                    </span>
                    <span className="font-medium">{fmt(amount)}</span>
                  </div>
                );
              })}

              {parseFloat(payslip.bonuses || '0') > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 flex items-center gap-2">
                    Bonuses
                    <span className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                      Taxable
                    </span>
                  </span>
                  <span className="font-medium">{fmt(payslip.bonuses)}</span>
                </div>
              )}

              <div className="border-t pt-3 space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Taxable Income (PAYE basis)</span>
                  <span>{fmt(taxableIncome)}</span>
                </div>
                <div className="flex justify-between font-semibold text-green-700 text-base">
                  <span>Total Gross Pay</span>
                  <span>{fmt(payslip.gross_pay)}</span>
                </div>
                {grossPay !== taxableIncome && (
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                    <Info className="h-3 w-3" />
                    Gross includes non-taxable allowances. PAYE is computed on taxable income only.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="px-6 py-4 border-b bg-red-50">
              <h3 className="text-lg font-semibold text-red-800">Deductions</h3>
            </div>
            <div className="p-6 space-y-3 text-sm">
              {parseFloat(payslip.tax || '0') > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">PAYE Income Tax</span>
                  <span className="font-medium">{fmt(payslip.tax)}</span>
                </div>
              )}
              {parseFloat(payslip.employee_pension || '0') > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Employee Pension (8% of gross)</span>
                  <span className="font-medium">{fmt(payslip.employee_pension)}</span>
                </div>
              )}

              {iouMonthlyDeduction > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Staff IOU Monthly Deduction</span>
                  <span className="font-medium">{fmt(iouMonthlyDeduction)}</span>
                </div>
              )}

              {otherDeductionsTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Other Deductions</span>
                  <span className="font-medium">{fmt(otherDeductionsTotal)}</span>
                </div>
              )}

              {Object.entries(payslip.deductions || {}).length > 0 && (
                <div className="rounded-md border bg-gray-50 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Detailed Deduction Breakdown
                  </p>
                  {Object.entries(payslip.deductions || {}).map(([name, amount]) => (
                    <div key={name} className="flex justify-between text-xs">
                      <span className="text-gray-600">{name}</span>
                      <span className="font-medium text-gray-800">{fmt(amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {iouOutstanding > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-800">Staff IOU Balance Outstanding</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">Before this period:</span>
                    <span className="font-semibold text-amber-900">{fmt(iouOutstanding)}</span>
                  </div>
                  {iouMonthlyDeduction > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-700">After this deduction (₦{fmt(iouMonthlyDeduction)}):</span>
                      <span className="font-semibold text-green-700">{fmt(iouBalanceAfter)}</span>
                    </div>
                  )}
                  {iouDetails.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-amber-200 pt-2">
                      {iouDetails.map(detail => (
                        <div
                          key={detail.reference_number}
                          className="flex justify-between text-xs text-amber-900"
                        >
                          <span>{detail.reference_number}</span>
                          <span>
                            {fmt(detail.monthly_installment)} / mo — balance before: {fmt(detail.balance_remaining)}
                            {detail.balance_after_this_period != null && (
                              <> → after: <span className="text-green-700">{fmt(detail.balance_after_this_period)}</span></>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="border-t pt-3">
                <div className="flex justify-between font-semibold text-red-700 text-base">
                  <span>Total Deductions</span>
                  <span>{fmt(payslip.total_deductions)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* PAYE Breakdown */}
          {payslip.paye_breakdown && payslip.paye_breakdown.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-6 py-4 border-b bg-orange-50 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-orange-700" />
                <div>
                  <h3 className="text-lg font-semibold text-orange-800">PAYE Tax Breakdown</h3>
                  <p className="text-xs text-orange-600">
                    Annual taxable income:{' '}
                    {payslip.annual_taxable_display || fmt(payslip.annual_taxable_income)}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Band
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Rate
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Income in Band
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Tax
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payslip.paye_breakdown.map((band, idx) => (
                      <tr
                        key={idx}
                        className={
                          parseFloat(String(band.tax_in_band ?? 0)) > 0 ? 'bg-orange-50' : ''
                        }
                      >
                        <td className="px-4 py-3 text-gray-700">{band.band}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-700">
                          {parseFloat(String(band.rate)).toFixed(0)}%
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {fmt(band.amount_in_band)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-orange-700">
                          {fmt(band.tax_in_band)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-orange-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 font-semibold text-orange-800">
                        Annual PAYE Total
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-orange-800">
                        {fmt(totalPAYE * 12)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-sm text-orange-700 italic">
                        Monthly deduction (÷ 12)
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-orange-700">
                        {fmt(payslip.tax)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Pension Summary */}
          {(pensionEmployee > 0 || pensionEmployer > 0) && (
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-6 py-4 border-b bg-blue-50 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-700" />
                <div>
                  <h3 className="text-lg font-semibold text-blue-800">Pension Contribution</h3>
                  <p className="text-xs text-blue-600">
                    Based on gross pay of {fmt(payslip.gross_pay)}
                  </p>
                </div>
              </div>
              <div className="p-6 text-sm space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Employee Contribution (8%)</span>
                  <span className="font-medium text-red-700">{fmt(pensionEmployee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Employer Contribution (10%)</span>
                  <span className="font-medium text-green-700">{fmt(pensionEmployer)}</span>
                </div>
                <div className="border-t pt-3 flex justify-between font-semibold text-blue-700">
                  <span>Total Remittable to PFA</span>
                  <span>{fmt(pensionTotal)}</span>
                </div>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Only the employee contribution (8%) is deducted from net pay. The employer's 10%
                  is an additional company expense.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right / Summary column */}
        <div className="space-y-6">
          {/* Net Pay Card */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="text-center">
              <div className="p-4 bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <DollarSign className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Net Pay</h3>
              <p className="text-3xl font-bold text-blue-600 mb-4">{fmt(payslip.net_pay)}</p>
              <div className="text-sm text-gray-600 space-y-1 text-left bg-gray-50 rounded-lg p-3">
                <div className="flex justify-between">
                  <span>Gross Pay</span>
                  <span className="font-medium">{fmt(payslip.gross_pay)}</span>
                </div>
                <div className="flex justify-between">
                  <span>PAYE Tax</span>
                  <span className="font-medium text-red-600">– {fmt(payslip.tax)}</span>
                </div>
                {pensionEmployee > 0 && (
                  <div className="flex justify-between">
                    <span>Employee Pension</span>
                    <span className="font-medium text-red-600">– {fmt(pensionEmployee)}</span>
                  </div>
                )}
                {iouMonthlyDeduction > 0 && (
                  <div className="flex justify-between">
                    <span>Staff IOU Monthly</span>
                    <span className="font-medium text-red-600">– {fmt(iouMonthlyDeduction)}</span>
                  </div>
                )}
                {otherDeductionsTotal > 0 && (
                  <div className="flex justify-between">
                    <span>Other Deductions</span>
                    <span className="font-medium text-red-600">– {fmt(otherDeductionsTotal)}</span>
                  </div>
                )}
                <div className="border-t pt-1 flex justify-between font-semibold">
                  <span>Total Deductions</span>
                  <span className="text-red-600">– {fmt(payslip.total_deductions)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* PDF actions */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-600" />
              Payslip PDF
            </h3>

            {payslip.pdf_file ? (
              <div className="space-y-3">
                <div className="border rounded-lg overflow-hidden">
                  <iframe
                    src={payslip.pdf_file}
                    className="w-full h-64"
                    title="Payslip PDF Preview"
                  />
                </div>
                <button
                  onClick={handleDownloadPDF}
                  disabled={downloadPDFMutation.isPending}
                  className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {downloadPDFMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {downloadPDFMutation.isPending ? 'Generating…' : 'Download PDF'}
                </button>
              </div>
            ) : (
              <div className="text-center py-4">
                <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-4">
                  No PDF cached yet. Click Download PDF to generate and download in one step.
                </p>
                <button
                  onClick={handleDownloadPDF}
                  disabled={downloadPDFMutation.isPending}
                  className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {downloadPDFMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {downloadPDFMutation.isPending ? 'Generating…' : 'Download PDF'}
                </button>
              </div>
            )}
          </div>

          {/* Status badge */}
          <div className="bg-white rounded-lg shadow-sm border p-4 text-sm text-gray-600">
            <span className="font-medium">Status: </span>
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                payslip.status === 'PAID'
                  ? 'bg-green-100 text-green-800'
                  : payslip.status === 'APPROVED'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-700'
              }`}
            >
              {payslip.status}
            </span>
          </div>
        </div>
      </div>

      {/* Email Modal */}
      <EmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        payslipId={payslip.id}
        staffEmail={undefined}
      />
    </div>
  );
};

export default PayslipDetailPage;
