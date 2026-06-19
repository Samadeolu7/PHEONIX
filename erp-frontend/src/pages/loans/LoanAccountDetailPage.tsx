/**
 * Loan Account Detail Page
 * Shows loan summary, client info, repayment schedule, and stage-appropriate action buttons.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  RefreshCw,
  X,
  CreditCard,
  CheckCircle,
  DollarSign,
} from 'lucide-react';
import {
  loanService,
  LoanAccount,
  LoanRepaymentSchedule,
  RepayLoanPayload,
} from '../../services/loanService';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_BADGE: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-700',
  approved:   'bg-blue-100 text-blue-700',
  disbursed:  'bg-indigo-100 text-indigo-700',
  active:     'bg-green-100 text-green-700',
  closed:     'bg-gray-100 text-gray-600',
  written_off:'bg-red-100 text-red-700',
  rejected:   'bg-red-100 text-red-700',
};

const SCHEDULE_STATUS_BADGE: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  partial:  'bg-orange-100 text-orange-700',
  paid:     'bg-green-100 text-green-700',
  overdue:  'bg-red-100 text-red-700',
};

// ── Repayment Modal ────────────────────────────────────────────────────────

interface RepayModalProps {
  loan: LoanAccount;
  nextInstallment: LoanRepaymentSchedule | null;
  onClose: () => void;
  onSuccess: () => void;
}

function RepayModal({ loan, nextInstallment, onClose, onSuccess }: RepayModalProps) {
  const totalDue = parseFloat(nextInstallment?.total_due ?? '0') - parseFloat(nextInstallment?.total_paid ?? '0');
  const [amount, setAmount] = useState(totalDue > 0 ? totalDue.toFixed(2) : '');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank_transfer'>('cash');
  const [bankReference, setBankReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const enteredAmount = parseFloat(amount) || 0;
  const excess = Math.max(0, enteredAmount - totalDue);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!enteredAmount || enteredAmount <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    if (paymentMode === 'bank_transfer' && !bankReference.trim()) {
      setError('Bank reference is required for bank transfer payments.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: RepayLoanPayload = {
        amount: amount,
        payment_date: paymentDate,
        payment_mode: paymentMode,
        bank_reference: paymentMode === 'bank_transfer' ? bankReference : undefined,
      };
      await loanService.repayLoan(loan.id, payload);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1200);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to record repayment.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={18} />
        </button>

        <h2 className="mb-1 text-lg font-semibold text-gray-900">Record Repayment</h2>
        <p className="mb-4 text-sm text-gray-500">
          {loan.loan_number} — {loan.client_name}
        </p>

        {nextInstallment && totalDue > 0 && (
          <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm">
            <div className="font-medium text-blue-800">
              Next Installment Due: {fmtDate(nextInstallment.due_date)}
            </div>
            <div className="mt-1 text-blue-700">
              Principal ₦{fmt(nextInstallment.principal_due)} + Interest ₦{fmt(nextInstallment.interest_due)} + Fees ₦{fmt(nextInstallment.fees_due)}{' '}
              = <strong>₦{fmt(totalDue)}</strong>
              {parseFloat(nextInstallment.total_paid) > 0 && (
                <span className="ml-1 text-blue-500">(₦{fmt(nextInstallment.total_paid)} already paid)</span>
              )}
            </div>
          </div>
        )}

        {success ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle size={40} className="mb-2 text-green-500" />
            <p className="font-medium text-gray-900">Repayment recorded successfully</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Amount (₦)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Enter amount collected"
                required
              />
              {excess > 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  ₦{fmt(excess)} excess will be credited to borrower's savings account
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Payment Mode
              </label>
              <div className="flex gap-3">
                {(['cash', 'bank_transfer'] as const).map((mode) => (
                  <label key={mode} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="paymentMode"
                      value={mode}
                      checked={paymentMode === mode}
                      onChange={() => setPaymentMode(mode)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm capitalize text-gray-700">
                      {mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {paymentMode === 'bank_transfer' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Bank Reference <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={bankReference}
                  onChange={(e) => setBankReference(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. TRF/20240617/1234567"
                  required={paymentMode === 'bank_transfer'}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Transaction reference from bank notification / statement
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
                Post Repayment
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function LoanAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const loanId = parseInt(id ?? '0', 10);

  const [loan, setLoan] = useState<LoanAccount | null>(null);
  const [schedule, setSchedule] = useState<LoanRepaymentSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRepayModal, setShowRepayModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!loanId) return;
    setLoading(true);
    setError(null);
    try {
      const [loanData, scheduleData] = await Promise.all([
        loanService.getLoan(loanId),
        loanService.getLoanSchedule(loanId),
      ]);
      setLoan(loanData);
      setSchedule(scheduleData);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load loan details.');
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove() {
    if (!loan) return;
    if (!window.confirm('Approve this loan application?')) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await loanService.approveLoan(loan.id);
      await load();
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setActionError(err?.detail ?? err?.message ?? 'Approval failed.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRequestDisbursement() {
    if (!loan) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await loanService.requestDisbursement(loan.id);
      navigate(`/loans/disbursements/${loan.id}`);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setActionError(err?.detail ?? err?.message ?? 'Could not create disbursement request.');
      setActionLoading(false);
    }
  }

  const nextInstallment = schedule
    .filter((s) => s.status === 'pending' || s.status === 'partial' || s.status === 'overdue')
    .sort((a, b) => a.installment_number - b.installment_number)[0] ?? null;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !loan) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={16} />
          {error ?? 'Loan not found.'}
        </div>
      </div>
    );
  }

  const isActive = loan.status === 'active' || loan.status === 'disbursed';
  const isOverdue = loan.days_in_arrears > 0 && isActive;

  return (
    <div className="min-h-screen bg-gray-50">
      {showRepayModal && (
        <RepayModal
          loan={loan}
          nextInstallment={nextInstallment}
          onClose={() => setShowRepayModal(false)}
          onSuccess={() => {
            setShowRepayModal(false);
            load();
          }}
        />
      )}

      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{loan.loan_number}</h1>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[loan.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {loan.status.replace('_', ' ')}
                </span>
                {isOverdue && (
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    {loan.days_in_arrears}d overdue
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">{loan.client_name} — {loan.product_name}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>

            {loan.status === 'pending' && (
              <Link
                to={`/loans/verification/${loan.id}`}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Start Verification
              </Link>
            )}

            {loan.status === 'approved' && (
              <button
                type="button"
                onClick={handleRequestDisbursement}
                disabled={actionLoading}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Request Disbursement
              </button>
            )}

            {/* For loans that have a verification but need approval */}
            {loan.status === 'pending' && (
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Approve
              </button>
            )}

            {isActive && (
              <button
                onClick={() => setShowRepayModal(true)}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <CreditCard size={14} />
                Collect Repayment
              </button>
            )}
          </div>
        </div>

        {actionError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            <AlertCircle size={14} />
            {actionError}
          </div>
        )}
      </div>

      <div className="mx-auto max-w-7xl space-y-6 p-6">
        {/* Summary Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Loan Summary */}
          <div className="col-span-2 rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Loan Summary
            </h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-gray-500">Product</p>
                <p className="font-medium text-gray-900">{loan.product_name}</p>
              </div>
              <div>
                <p className="text-gray-500">Application Date</p>
                <p className="font-medium text-gray-900">{fmtDate(loan.application_date)}</p>
              </div>
              <div>
                <p className="text-gray-500">Disbursement Date</p>
                <p className="font-medium text-gray-900">{fmtDate(loan.disbursement_date)}</p>
              </div>
              <div>
                <p className="text-gray-500">Maturity Date</p>
                <p className="font-medium text-gray-900">{fmtDate(loan.maturity_date)}</p>
              </div>
              <div>
                <p className="text-gray-500">Term</p>
                <p className="font-medium text-gray-900">{loan.term_months} months</p>
              </div>
              <div>
                <p className="text-gray-500">Frequency</p>
                <p className="font-medium capitalize text-gray-900">{loan.repayment_frequency}</p>
              </div>
              <div>
                <p className="text-gray-500">Interest Rate</p>
                <p className="font-medium text-gray-900">{loan.interest_rate}% ({loan.interest_method})</p>
              </div>
              <div>
                <p className="text-gray-500">Disbursed Amount</p>
                <p className="font-medium text-gray-900">₦{fmt(loan.disbursed_amount)}</p>
              </div>
              <div>
                <p className="text-gray-500">Outstanding Principal</p>
                <p className="font-semibold text-gray-900">₦{fmt(loan.outstanding_principal)}</p>
              </div>
              <div>
                <p className="text-gray-500">Total Repaid</p>
                <p className="font-medium text-green-700">₦{fmt(loan.total_repaid)}</p>
              </div>
              <div>
                <p className="text-gray-500">Total Outstanding</p>
                <p className="font-semibold text-red-700">₦{fmt(loan.total_outstanding)}</p>
              </div>
              <div>
                <p className="text-gray-500">Next Due Date</p>
                <p className="font-medium text-gray-900">{fmtDate(loan.next_due_date)}</p>
              </div>
              {loan.days_in_arrears > 0 && (
                <div>
                  <p className="text-gray-500">Days in Arrears</p>
                  <p className="font-semibold text-red-600">{loan.days_in_arrears} days (₦{fmt(loan.arrears_amount)})</p>
                </div>
              )}
            </div>
          </div>

          {/* Client Info */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Client
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-500">Name</p>
                <p className="font-semibold text-gray-900">{loan.client_name}</p>
              </div>
              <div>
                <p className="text-gray-500">Risk Classification</p>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  loan.risk_classification === 'performing' ? 'bg-green-100 text-green-700' :
                  loan.risk_classification === 'watch' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {loan.risk_classification}
                </span>
              </div>
              {loan.processing_fee && parseFloat(loan.processing_fee) > 0 && (
                <div>
                  <p className="text-gray-500">Processing Fee</p>
                  <p className="font-medium text-gray-900">₦{fmt(loan.processing_fee)}</p>
                </div>
              )}
              {loan.insurance_amount && parseFloat(loan.insurance_amount) > 0 && (
                <div>
                  <p className="text-gray-500">Insurance</p>
                  <p className="font-medium text-gray-900">₦{fmt(loan.insurance_amount)}</p>
                </div>
              )}
              <div className="pt-2">
                <Link
                  to={`/clients/${loan.client}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View Client Profile →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Repayment Schedule */}
        <div className="rounded-xl bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Repayment Schedule
            </h2>
          </div>

          {schedule.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              No schedule generated yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3 text-right">Principal</th>
                    <th className="px-4 py-3 text-right">Interest</th>
                    <th className="px-4 py-3 text-right">Fees</th>
                    <th className="px-4 py-3 text-right">Total Due</th>
                    <th className="px-4 py-3 text-right">Total Paid</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Payment Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...schedule]
                    .sort((a, b) => a.installment_number - b.installment_number)
                    .map((row) => {
                      const isRowOverdue = row.status === 'overdue';
                      return (
                        <tr
                          key={row.id}
                          className={isRowOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}
                        >
                          <td className="px-4 py-3 font-medium text-gray-700">{row.installment_number}</td>
                          <td className={`px-4 py-3 ${isRowOverdue ? 'font-medium text-red-700' : 'text-gray-700'}`}>
                            {fmtDate(row.due_date)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">₦{fmt(row.principal_due)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">₦{fmt(row.interest_due)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">₦{fmt(row.fees_due)}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">₦{fmt(row.total_due)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${parseFloat(row.total_paid) > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                            {parseFloat(row.total_paid) > 0 ? `₦${fmt(row.total_paid)}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SCHEDULE_STATUS_BADGE[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {fmtDate(row.paid_date)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
