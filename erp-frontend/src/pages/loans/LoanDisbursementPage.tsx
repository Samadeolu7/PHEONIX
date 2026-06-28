// src/pages/loans/LoanDisbursementPage.tsx
/**
 * Loan Disbursement Approval & Execution
 * Feature #10 — Disbursement Approval Workflow
 * Feature #9  — Maker-checker: creator cannot approve
 *
 * Route: /loans/disbursements/:loanId
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  loanService,
  LoanDisbursement,
  DisbursementStatus,
} from '../../services/loanService';
import { bankService } from '../../services/bankService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import {
  Banknote,
  CheckCircle,
  XCircle,
  ArrowLeft,
  AlertTriangle,
  Send,
  Copy,
  Building2,
  CreditCard,
  User,
} from 'lucide-react';

import type { BankAccount } from '../../types/banks';

const STATUS_LABELS: Record<DisbursementStatus, string> = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  disbursed: 'Disbursed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<DisbursementStatus, string> = {
  pending_approval: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  disbursed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
};

const LoanDisbursementPage: React.FC = () => {
  const { loanId } = useParams<{ loanId: string }>();
  const navigate = useNavigate();
  const { user, selectedRole } = useAuth();
  const { success, error: showError } = useToast();

  const [disbursement, setDisbursement] = useState<LoanDisbursement | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [selectedBankAccount, setSelectedBankAccount] = useState<number | ''>('');
  const [disburseNotes, setDisburseNotes] = useState('');
  const [copied, setCopied] = useState(false);

  const copyAccountNumber = (value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Maker-checker: requester cannot disburse — enforced on the backend too
  const isRequester = disbursement ? disbursement.requested_by === user?.id : false;
  const canDisburse = !isRequester;

  const loadData = useCallback(async () => {
    if (!loanId) return;
    try {
      const [disbList, bankAccRes] = await Promise.all([
        loanService.listDisbursements({ loan: Number(loanId) }),
        bankService.listBankAccounts({ is_active: true }),
      ]);
      setBankAccounts(bankAccRes);

      if (disbList.length > 0) {
        setDisbursement(disbList[0]);
      } else {
        // No disbursement record yet — create one automatically.
        // This handles the case where the user navigated here directly
        // before the "Request Disbursement" button had a chance to create it.
        const created = await loanService.requestDisbursement(Number(loanId));
        setDisbursement(created);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Failed to load disbursement data';
      showError(msg);
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDisburse = async () => {
    if (!disbursement || !selectedBankAccount) {
      showError('Please select a disbursement account');
      return;
    }
    try {
      setSubmitting(true);
      const updated = await loanService.disburseLoan(disbursement.id, {
        disbursement_account: Number(selectedBankAccount),
        notes: disburseNotes,
      });
      setDisbursement(updated);
      success('Loan disbursed successfully');
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Failed to disburse loan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!disbursement || !rejectReason.trim()) {
      showError('A rejection reason is required');
      return;
    }
    try {
      setSubmitting(true);
      const updated = await loanService.rejectDisbursement(disbursement.id, rejectReason);
      setDisbursement(updated);
      setShowRejectForm(false);
      success('Disbursement rejected');
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Failed to reject disbursement');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!disbursement) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800">Could not create or load a disbursement request. Please ensure the loan is in Approved status and try again.</p>
        </div>
      </div>
    );
  }

  const d = disbursement;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          title="Go back"
          aria-label="Go back"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Banknote className="w-6 h-6 text-green-600" />
            Disbursement — {d.loan_number}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Requested by {d.requested_by_name}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${STATUS_COLORS[d.status]}`}>
          {STATUS_LABELS[d.status]}
        </span>
      </div>

      {/* Customer & Loan Summary */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Loan Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Client</p>
            <p className="font-medium text-gray-900">{d.client_name || '—'}</p>
          </div>
          <div>
            <p className="text-gray-500">Phone</p>
            <p className="font-medium text-gray-900">{d.client_phone || '—'}</p>
          </div>
          <div className="col-span-2 bg-gray-50 rounded-lg p-3 border border-gray-100">
            <p className="text-gray-500 text-xs mb-0.5">Disbursement Amount</p>
            <p className="font-bold text-gray-900 text-2xl">
              {d.loan_amount
                ? `₦${parseFloat(d.loan_amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
                : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Loan #{d.loan_number}</p>
          </div>
        </div>
      </div>

      {/* Recipient Bank Details — the "Pay To" information */}
      <div className={`rounded-xl shadow-sm p-5 space-y-4 border-2 ${
        d.client_bank_account_number
          ? 'bg-blue-50 border-blue-200'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2 text-blue-800">
            <Building2 className="w-4 h-4" />
            Pay To — Recipient Bank Details
          </h3>
          {!d.client_bank_account_number && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
              No bank details on file
            </span>
          )}
        </div>

        {d.client_bank_account_number ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Bank name */}
            <div className="bg-white rounded-lg border border-blue-100 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                <p className="text-xs text-gray-500 font-medium">Bank</p>
              </div>
              <p className="font-semibold text-gray-900 text-sm">{d.client_bank_name || '—'}</p>
            </div>

            {/* Account number — most important, allow copy */}
            <div className="bg-white rounded-lg border border-blue-200 p-3 sm:col-span-1">
              <div className="flex items-center gap-1.5 mb-1">
                <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                <p className="text-xs text-gray-500 font-medium">Account Number</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-gray-900 text-lg tracking-widest font-mono">
                  {d.client_bank_account_number}
                </p>
                <button
                  type="button"
                  onClick={() => copyAccountNumber(d.client_bank_account_number!)}
                  title="Copy account number"
                  className="p-1 rounded hover:bg-blue-100 text-blue-500 hover:text-blue-700 transition-colors"
                >
                  {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Account name */}
            <div className="bg-white rounded-lg border border-blue-100 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <User className="w-3.5 h-3.5 text-blue-400" />
                <p className="text-xs text-gray-500 font-medium">Account Name</p>
              </div>
              <p className="font-semibold text-gray-900 text-sm">{d.client_bank_account_name || '—'}</p>
            </div>
          </div>
        ) : (
          <div className="text-sm text-amber-700">
            The client record does not have bank details saved. Please update the client profile
            before executing a bank transfer disbursement.
          </div>
        )}

        {/* BVN — shown below if present */}
        {d.client_bvn && (
          <div className="flex items-center gap-2 pt-1 border-t border-blue-100 text-xs text-gray-500">
            <span className="font-medium">BVN:</span>
            <span className="font-mono tracking-wider text-gray-700">{d.client_bvn}</span>
          </div>
        )}
      </div>

      {/* Workflow Details */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Workflow</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Requested by</p>
            <p className="font-medium text-gray-900">{d.requested_by_name}</p>
          </div>
          {d.approved_by_name && (
            <div>
              <p className="text-gray-500">Approved by</p>
              <p className="font-medium text-gray-900">{d.approved_by_name}</p>
            </div>
          )}
          {d.approved_at && (
            <div>
              <p className="text-gray-500">Approved at</p>
              <p className="font-medium text-gray-900">{new Date(d.approved_at).toLocaleString()}</p>
            </div>
          )}
          {d.disbursement_date && (
            <div>
              <p className="text-gray-500">Disbursement date</p>
              <p className="font-medium text-gray-900">{new Date(d.disbursement_date).toLocaleDateString()}</p>
            </div>
          )}
          {d.disbursement_bank_name && (
            <div>
              <p className="text-gray-500">Bank</p>
              <p className="font-medium text-gray-900">{d.disbursement_bank_name}</p>
            </div>
          )}
          {d.disbursement_account_name && (
            <div>
              <p className="text-gray-500">Account</p>
              <p className="font-medium text-gray-900">
                {d.disbursement_account_name}
                {d.disbursement_account_number ? ` (${d.disbursement_account_number})` : ''}
              </p>
            </div>
          )}
          {d.rejection_reason && (
            <div className="col-span-2">
              <p className="text-gray-500">Rejection reason</p>
              <p className="font-medium text-red-700">{d.rejection_reason}</p>
            </div>
          )}
          {d.notes && (
            <div className="col-span-2">
              <p className="text-gray-500">Notes</p>
              <p className="font-medium text-gray-900">{d.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Maker-checker notice */}
      {d.status === 'pending_approval' && isRequester && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>You requested this disbursement. Another officer must process it.</span>
        </div>
      )}

      {/* Disburse panel */}
      {d.status === 'pending_approval' && canDisburse && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">Execute Disbursement</h3>

          {/* Confirmation summary */}
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Confirm Transfer Details</p>
            <div className="flex justify-between">
              <span className="text-gray-500">To:</span>
              <span className="font-semibold text-gray-900">{d.client_name}</span>
            </div>
            {d.client_bank_account_number && (
              <div className="flex justify-between">
                <span className="text-gray-500">Account:</span>
                <span className="font-mono font-bold text-gray-900 tracking-wider">{d.client_bank_account_number}</span>
              </div>
            )}
            {d.client_bank_name && (
              <div className="flex justify-between">
                <span className="text-gray-500">Bank:</span>
                <span className="font-medium text-gray-900">{d.client_bank_name}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="text-gray-500">Amount:</span>
              <span className="font-bold text-green-700 text-base">
                ₦{d.loan_amount ? parseFloat(d.loan_amount).toLocaleString('en-NG', { minimumFractionDigits: 2 }) : '—'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Disbursement Account <span className="text-red-500">*</span>
              </label>
              <select
                title="Disbursement account"
                value={selectedBankAccount}
                onChange={(e) => setSelectedBankAccount(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select bank account —</option>
                {bankAccounts.map((ba) => (
                  <option key={ba.id} value={ba.id}>
                    {ba.bank_display_name || ba.bank_name} — {ba.account_number} ({ba.account_name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                title="Notes"
                className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Optional notes…"
                value={disburseNotes}
                onChange={(e) => setDisburseNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDisburse}
                disabled={submitting || !selectedBankAccount}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting
                  ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  : <Send className="w-4 h-4" />
                }
                Disburse
              </button>
              <button
                type="button"
                onClick={() => setShowRejectForm((v) => !v)}
                className="flex items-center gap-2 px-5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition-colors"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
            </div>
            {showRejectForm && (
              <div className="space-y-2 border-t pt-3">
                <textarea
                  title="Rejection reason"
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows={3}
                  placeholder="Rejection reason (required)…"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={submitting || !rejectReason.trim()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Confirm Rejection'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {d.status === 'disbursed' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-green-800">Loan disbursed</p>
            <p className="text-sm text-green-700">GL entries have been posted.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanDisbursementPage;
