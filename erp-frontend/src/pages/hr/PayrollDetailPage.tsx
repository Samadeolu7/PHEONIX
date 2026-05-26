// Payroll Detail Page - View payroll with calculate/approve/process actions and embedded payslips list
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Calendar,
  DollarSign,
  Users,
  FileText,
  Download,
  AlertCircle,
  CheckCircle,
  BookOpen,
  Landmark,
} from 'lucide-react';
import { PayrollStatusBadge } from '../../components/hr/PayrollStatusBadge';
import { PayrollActions } from '../../components/hr/PayrollActions';
import { PayslipCard } from '../../components/hr/PayslipCard';
import { hrService } from '../../services/hrService';
import { payslipService } from '../../services/payslipService';
import { useToast } from '../../hooks/useToast';
import { PayrollWithPayslips, PayrollStatus } from '../../types/hr';

const PayrollDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, info, error: showError } = useToast();

  const [payroll, setPayroll] = useState<PayrollWithPayslips | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDownloadPayslip = async (payslipId: number, payslipNumber: string) => {
    if (downloadingId) return;
    setDownloadingId(payslipId);
    try {
      await payslipService.downloadPDF(payslipId, `Payslip-${payslipNumber}.pdf`);
      success('Payslip downloaded');
    } catch (err: any) {
      showError(err?.message || 'Failed to download payslip');
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    if (id) {
      loadPayroll();
    }
  }, [id]);

  const loadPayroll = async () => {
    try {
      setLoading(true);
      const response = await hrService.getPayrollWithPayslips(Number(id));
      setPayroll(response);
    } catch (error) {
      console.error('Error loading payroll:', error);
      showError('Failed to load payroll details');
      navigate('/hr/payroll');
    } finally {
      setLoading(false);
    }
  };

  const handlePayrollAction = async (action: 'calculate' | 'recalculate' | 'approve' | 'process' | 'mark_paid') => {
    if (!payroll) return;

    try {
      setActionLoading(action);

      let result;
      switch (action) {
        case 'calculate':
          result = await hrService.calculatePayroll(payroll.id);
          success('Payroll calculated successfully');
          break;
        case 'recalculate':
          result = await hrService.recalculatePayroll(payroll.id);
          success('Payroll recalculated successfully — payslips now include up-to-date IOU deductions');
          break;
        case 'approve':
          result = await hrService.approvePayroll(payroll.id);
          success('Payroll approved successfully');
          break;
        case 'process':
          result = await hrService.processPayroll(payroll.id);
          success('Payroll processed successfully');
          break;
        case 'mark_paid':
          result = await hrService.markPayrollPaid(payroll.id);
          success('Payroll marked as paid successfully');
          break;
      }

      // Reload the full payroll data to get updated payslips
      await loadPayroll();
    } catch (error) {
      console.error(`Error ${action}ing payroll:`, error);
      showError(`Failed to ${action} payroll`);
    } finally {
      setActionLoading('');
    }
  };

  const handleGeneratePayslips = async () => {
    if (!payroll) return;
    try {
      setActionLoading('generate');
      const res = await hrService.generatePayslips(payroll.id);
      success(res.message ?? `Generated ${res.generated} payslips`);
      await loadPayroll();
    } catch (error) {
      console.error('Error generating payslips:', error);
      showError('Failed to generate payslips');
    } finally {
      setActionLoading('');
    }
  };

  const handleDownloadBankFile = async () => {
    if (!payroll) return;
    try {
      setActionLoading('bankfile');
      await hrService.downloadBankFile(payroll.id, payroll.payroll_number);
      success('Bank transfer file downloaded');
    } catch (error) {
      console.error('Error downloading bank file:', error);
      showError('Failed to download bank file');
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async () => {
    if (!payroll) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete payroll "${payroll.reference_number}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      await hrService.deletePayroll(payroll.id);
      success('Payroll deleted successfully');
      navigate('/hr/payroll');
    } catch (error) {
      console.error('Error deleting payroll:', error);
      showError('Failed to delete payroll');
    } finally {
      setDeleting(false);
    }
  };

  const formatCurrency = (amount: string | number | null | undefined) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(String(amount || 0)));
  };

  const toAmount = (value: string | number | null | undefined): number =>
    parseFloat(String(value || 0)) || 0;

  const escapeCsv = (value: string | number | null | undefined) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const exportPayrollReconciliationCsv = () => {
    if (!payroll?.payslips?.length) {
      info('No payslips available to export for this payroll.');
      return;
    }

    const headers = [
      'Payslip Number',
      'Staff ID',
      'Staff Name',
      'Gross Pay',
      'PAYE Tax',
      'Employee Pension',
      'Staff IOU Monthly',
      'Other Deductions',
      'Total Deductions',
      'Net Pay',
      'Staff IOU Outstanding',
      'Deduction Breakdown (JSON)',
    ];

    const rows = payroll.payslips.map(slip => {
      const iouMonthly = toAmount(slip.iou_monthly_deduction ?? slip.deductions?.['Staff IOU']);
      const otherDeductions =
        slip.other_deductions_total != null
          ? toAmount(slip.other_deductions_total)
          : Object.entries(slip.deductions || {}).reduce((sum, [name, amount]) => {
              if (name === 'Staff IOU') return sum;
              return sum + toAmount(amount as string | number);
            }, 0);

      return [
        slip.payslip_number,
        slip.staff_id,
        slip.staff_name,
        slip.gross_pay,
        slip.tax || '0',
        slip.employee_pension || '0',
        iouMonthly.toFixed(2),
        otherDeductions.toFixed(2),
        slip.total_deductions,
        slip.net_pay,
        toAmount(slip.iou_total_outstanding).toFixed(2),
        JSON.stringify(slip.deductions || {}),
      ];
    });

    const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${payroll.reference_number}_reconciliation.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    success('Payroll reconciliation CSV exported.');
  };

  const calculatePeriodDays = () => {
    if (!payroll) return 0;

    const start = new Date(payroll.period_start);
    const end = new Date(payroll.period_end);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return diffDays;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!payroll) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Payroll Not Found</h2>
          <p className="text-gray-600 mb-4">The payroll record you're looking for doesn't exist.</p>
          <Link
            to="/hr/payroll"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            Back to Payroll List
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/hr/payroll')}
              className="mr-4 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Payroll Details</h1>
              <p className="text-gray-600">
                {payroll.reference_number} - {new Date(payroll.period_start).toLocaleDateString()}{' '}
                to {new Date(payroll.period_end).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Workflow Actions */}
            <PayrollActions
              payroll={payroll}
              onAction={handlePayrollAction}
              loading={actionLoading}
              size="md"
            />

            {/* Generate Payslips — available once payroll is calculated or later */}
            {payroll.status &&
              [PayrollStatus.CALCULATED, PayrollStatus.APPROVED, PayrollStatus.PAID].includes(
                payroll.status
              ) && (
                <button
                  title="Generate PDF payslips for all staff"
                  onClick={handleGeneratePayslips}
                  disabled={actionLoading === 'generate'}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  <FileText className="h-4 w-4" />
                  {actionLoading === 'generate' ? 'Generating…' : 'Generate Payslips'}
                </button>
              )}

            {/* Download Bank File — available for approved or paid payroll */}
            {payroll.status &&
              [PayrollStatus.APPROVED, PayrollStatus.PAID].includes(payroll.status) && (
                <button
                  title="Download bank transfer CSV file"
                  onClick={handleDownloadBankFile}
                  disabled={actionLoading === 'bankfile'}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  <Landmark className="h-4 w-4" />
                  {actionLoading === 'bankfile' ? 'Downloading…' : 'Bank File'}
                </button>
              )}

            {/* Standard Actions */}
            {payroll.status === PayrollStatus.DRAFT && (
              <>
                <Link
                  to={`/hr/payroll/${payroll.id}/edit`}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Link>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center"
                >
                  {deleting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status Overview */}
        <div className="bg-white rounded-lg shadow mb-6 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Payroll Status</h2>
            <PayrollStatusBadge status={payroll.status!} size="lg" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <Calendar className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500">Period Duration</p>
              <p className="text-lg font-semibold text-gray-900">{calculatePeriodDays()} days</p>
            </div>

            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <Users className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500">Payslips</p>
              <p className="text-lg font-semibold text-gray-900">{payroll.payslips_count}</p>
            </div>

            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <DollarSign className="h-8 w-8 text-purple-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500">Gross Pay</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatCurrency(payroll.total_gross_pay)}
              </p>
            </div>

            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <CheckCircle className="h-8 w-8 text-orange-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500">Net Pay</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatCurrency(payroll.total_net_pay)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Payroll Information */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Payroll Information
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Reference Number
                  </label>
                  <p className="mt-1 text-sm text-gray-900">{payroll.reference_number}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500">Period Start</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(payroll.period_start).toLocaleDateString()}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500">Period End</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(payroll.period_end).toLocaleDateString()}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500">Pay Date</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(payroll.pay_date).toLocaleDateString()}
                  </p>
                </div>

                {payroll.notes && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Notes</label>
                    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                      {payroll.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="mt-6 bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <DollarSign className="h-5 w-5 mr-2" />
                  Financial Summary
                </h3>
              </div>
              <div className="p-6 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Total Gross Pay</span>
                  <span className="text-sm text-gray-900">
                    {formatCurrency(payroll.total_gross_pay)}
                  </span>
                </div>

                {/* Deductions breakdown */}
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Total Deductions</span>
                  <span className="text-sm text-red-600">
                    -{formatCurrency(payroll.total_deductions)}
                  </span>
                </div>

                {payroll.total_employee_pension != null &&
                  Number(payroll.total_employee_pension) > 0 && (
                    <div className="flex justify-between pl-4">
                      <span className="text-xs text-gray-400">↳ Employee Pension (8%)</span>
                      <span className="text-xs text-red-400">
                        -{formatCurrency(payroll.total_employee_pension)}
                      </span>
                    </div>
                  )}

                {Number(payroll.total_staff_iou_deductions || 0) > 0 && (
                  <div className="flex justify-between pl-4">
                    <span className="text-xs text-gray-400">↳ Staff IOU Monthly Deductions</span>
                    <span className="text-xs text-red-500">
                      -{formatCurrency(payroll.total_staff_iou_deductions)}
                    </span>
                  </div>
                )}

                {Number(payroll.total_other_deductions || 0) > 0 && (
                  <div className="flex justify-between pl-4">
                    <span className="text-xs text-gray-400">↳ Other Deductions</span>
                    <span className="text-xs text-red-500">
                      -{formatCurrency(payroll.total_other_deductions)}
                    </span>
                  </div>
                )}

                {payroll.total_employer_pension != null &&
                  Number(payroll.total_employer_pension) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-500">
                        Employer Pension (10%)
                      </span>
                      <span className="text-sm text-orange-600">
                        {formatCurrency(payroll.total_employer_pension)}
                      </span>
                    </div>
                  )}

                <div className="border-t border-gray-200 pt-3">
                  <div className="flex justify-between">
                    <span className="text-base font-semibold text-gray-900">Total Net Pay</span>
                    <span className="text-base font-semibold text-green-600">
                      {formatCurrency(payroll.total_net_pay)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Accounting Entries Status */}
            {(payroll.status === PayrollStatus.APPROVED ||
              payroll.status === PayrollStatus.PAID) && (
              <div className="mt-6 bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-indigo-600" />
                    Accounting Entries
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    General Ledger journal entries generated for this payroll
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  {/* Stage 1 — Payroll Liabilities */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        payroll.liabilities_journal_entry
                          ? 'bg-green-100'
                          : 'bg-amber-50 border border-amber-200'
                      }`}
                    >
                      {payroll.liabilities_journal_entry ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Landmark className="w-4 h-4 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">
                          Stage 1 — Payroll Liabilities
                        </p>
                        {payroll.liabilities_journal_entry ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                            Posted #{payroll.liabilities_journal_entry}
                          </span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            Pending
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        DR Salary Expense &nbsp;|&nbsp; CR Salaries Payable, PAYE Payable, Pension
                        Payable
                      </p>
                    </div>
                  </div>

                  {/* Stage 2 — Pension Expense */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        payroll.pension_expense_journal_entry
                          ? 'bg-green-100'
                          : 'bg-amber-50 border border-amber-200'
                      }`}
                    >
                      {payroll.pension_expense_journal_entry ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Landmark className="w-4 h-4 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">
                          Stage 2 — Employer Pension Expense
                        </p>
                        {payroll.pension_expense_journal_entry ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                            Posted #{payroll.pension_expense_journal_entry}
                          </span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            Pending
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        DR Pension Expense &nbsp;|&nbsp; CR Employer Pension Payable
                      </p>
                    </div>
                  </div>

                  {/* Stage 3 — Disbursement (only when paid) */}
                  {payroll.status === PayrollStatus.PAID && (
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          payroll.journal_entry
                            ? 'bg-green-100'
                            : 'bg-amber-50 border border-amber-200'
                        }`}
                      >
                        {payroll.journal_entry ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Landmark className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-gray-800">
                            Stage 3 — Salary Disbursement
                          </p>
                          {payroll.journal_entry ? (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                              Posted #{payroll.journal_entry}
                            </span>
                          ) : (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                              Pending
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          DR Salaries Payable &nbsp;|&nbsp; CR Cash / Bank Account
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dual-Signature Approval Status */}
            {(payroll.status === PayrollStatus.CALCULATED ||
              payroll.status === PayrollStatus.APPROVED ||
              payroll.status === PayrollStatus.PAID) && (
              <div className="mt-6 bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Approval Status
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  {/* First Approval */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-1 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        payroll.first_approver ? 'bg-green-100' : 'bg-gray-100'
                      }`}
                    >
                      {payroll.first_approver ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        First Approval {payroll.first_approver ? '✓' : '(Pending)'}
                      </p>
                      {payroll.first_approver ? (
                        <>
                          <p className="text-sm text-gray-600">
                            Approved by: {payroll.first_approver_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(payroll.first_approved_at!).toLocaleString()}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-500">Awaiting Finance Manager approval</p>
                      )}
                    </div>
                  </div>

                  {/* Second Approval */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-1 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        payroll.second_approver ? 'bg-green-100' : 'bg-gray-100'
                      }`}
                    >
                      {payroll.second_approver ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        Second Approval {payroll.second_approver ? '✓' : '(Pending)'}
                      </p>
                      {payroll.second_approver ? (
                        <>
                          <p className="text-sm text-gray-600">
                            Approved by: {payroll.second_approver_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(payroll.second_approved_at!).toLocaleString()}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-500">
                          {payroll.first_approver
                            ? 'Awaiting Principal/Second approver signature'
                            : 'Requires first approval before second approval'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status Banner */}
                  {payroll.first_approver && payroll.second_approver && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 text-green-800">
                        <CheckCircle className="w-5 h-5" />
                        <p className="text-sm font-medium">Dual-signature authorization complete</p>
                      </div>
                    </div>
                  )}

                  {!payroll.first_approver && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-2 text-yellow-800">
                        <AlertCircle className="w-5 h-5" />
                        <p className="text-sm font-medium">Awaiting dual-signature authorization</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Payslips List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Users className="h-5 w-5 mr-2" />
                    Payslips ({payroll.payslips?.length || 0})
                  </h3>
                  {payroll.payslips && payroll.payslips.length > 0 && (
                    <button
                      onClick={exportPayrollReconciliationCsv}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export Reconciliation CSV
                    </button>
                  )}
                </div>
              </div>

              <div className="p-6">
                {!payroll.payslips || payroll.payslips.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h4 className="text-lg font-medium text-gray-900 mb-2">
                      No Payslips Generated
                    </h4>
                    <p className="text-gray-600 mb-4">
                      {payroll.status === PayrollStatus.DRAFT
                        ? 'Calculate the payroll to generate payslips for all employees.'
                        : 'No payslips are available for this payroll period.'}
                    </p>
                    {payroll.status === PayrollStatus.DRAFT && (
                      <PayrollActions
                        payroll={payroll}
                        onAction={handlePayrollAction}
                        loading={actionLoading}
                        size="md"
                      />
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {payroll.payslips.map(payslip => (
                      <PayslipCard
                        key={payslip.id}
                        payslip={payslip}
                        onDownload={() => handleDownloadPayslip(payslip.id, payslip.payslip_number)}
                        onView={() => navigate(`/hr/payslips/${payslip.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status-specific Information */}
        {payroll.status === PayrollStatus.DRAFT && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-blue-600 mr-2" />
              <h4 className="text-sm font-medium text-blue-900">Draft Status</h4>
            </div>
            <p className="mt-2 text-sm text-blue-800">
              This payroll is in draft status. You can edit the period details or calculate the
              payroll to generate payslips for all employees in the system.
            </p>
          </div>
        )}

        {payroll.status === PayrollStatus.CALCULATED && (
          <div className="mt-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-orange-600 mr-2" />
              <h4 className="text-sm font-medium text-orange-900">Calculated Status</h4>
            </div>
            <p className="mt-2 text-sm text-orange-800">
              Payroll has been calculated and payslips generated. Please review the amounts and
              approve the payroll to proceed with processing.
            </p>
          </div>
        )}

        {payroll.status === PayrollStatus.APPROVED && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              <h4 className="text-sm font-medium text-green-900">Approved Status</h4>
            </div>
            <p className="mt-2 text-sm text-green-800">
              Payroll has been approved and is ready for processing. Process the payroll to initiate
              payments to all employees.
            </p>
          </div>
        )}

        {payroll.status === PayrollStatus.PAID && (
          <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-purple-600 mr-2" />
              <h4 className="text-sm font-medium text-purple-900">Processed Status</h4>
            </div>
            <p className="mt-2 text-sm text-purple-800">
              Payroll has been processed successfully. Payments have been initiated and payslips are
              available for download.
            </p>
          </div>
        )}

        {/* Metadata */}
        <div className="mt-6 bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Record Information</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block font-medium text-gray-500">Created At</label>
                <p className="mt-1 text-gray-900">
                  {new Date(payroll.created_at).toLocaleString()}
                </p>
              </div>
              <div>
                <label className="block font-medium text-gray-500">Last Updated</label>
                <p className="mt-1 text-gray-900">
                  {new Date(payroll.updated_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayrollDetailPage;
