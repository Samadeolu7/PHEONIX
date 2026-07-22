/**
 * Director's inbox for savings-debit loan repayment requests.
 * Lists pending requests; director can approve or reject each.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Loader2,
  PiggyBank,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { LoanRepaymentRequest } from '../../services/loanService';
import { ClientAvatar } from '../../components/ui/ClientAvatar';
import {
  useLoanRepaymentApprovals,
  useApproveRepaymentRequest,
  useRejectRepaymentRequest,
} from '../../hooks/useLoans';

function fmt(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_BADGE: Record<LoanRepaymentRequest['status'], string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  posted:   'bg-green-100 text-green-700',
};

// ── Reject modal ────────────────────────────────────────────────────────────

interface RejectModalProps {
  request: LoanRepaymentRequest;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  loading: boolean;
}

function RejectModal({ request, onConfirm, onClose, loading }: RejectModalProps) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-gray-900">Reject Request #{request.id}</h2>
        <p className="mb-4 text-sm text-gray-500">
          ₦{fmt(request.amount)} from {request.client_name} — {request.savings_account_number}
        </p>
        <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="rejection-reason">
          Reason for rejection
        </label>
        <textarea
          id="rejection-reason"
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="Explain why this request is being rejected…"
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
        />
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Row actions ─────────────────────────────────────────────────────────────

interface RequestRowProps {
  req: LoanRepaymentRequest;
  onApprove: (id: number) => void;
  onReject: (req: LoanRepaymentRequest) => void;
  isApproving: boolean;
}

function RequestRow({ req, onApprove, onReject, isApproving }: RequestRowProps) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
        #{req.id}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <ClientAvatar image={req.client_image} name={req.client_name} size="sm" />
          <div>
            <p className="text-sm font-medium text-gray-900">{req.client_name}</p>
            <p className="text-xs text-gray-500">{req.loan_number}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        <p>₦{fmt(req.amount)}</p>
        {req.covered_installments_detail?.length > 0 && (
          <p className="mt-0.5 text-xs text-gray-500">
            Installment{req.covered_installments_detail.length > 1 ? 's' : ''}{' '}
            #{req.covered_installments_detail[0].installment_number}
            {req.covered_installments_detail.length > 1
              ? `–#${req.covered_installments_detail[req.covered_installments_detail.length - 1].installment_number}`
              : ''}
            {req.covered_installments_detail.some(s => s.status === 'overdue') && (
              <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 font-medium text-red-700">
                overdue
              </span>
            )}
          </p>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
        {req.savings_account_number}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
        {fmtDate(req.payment_date)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
        {req.requested_by_name}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[req.status]}`}>
          {req.status}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {req.status === 'pending' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isApproving}
              onClick={() => onApprove(req.id)}
              className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isApproving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              Approve
            </button>
            <button
              type="button"
              disabled={isApproving}
              onClick={() => onReject(req)}
              className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle size={12} />
              Reject
            </button>
          </div>
        )}
        {req.status !== 'pending' && (
          <p className="text-xs text-gray-400">
            {req.reviewed_by_name ?? '—'} · {fmtDate(req.reviewed_at)}
          </p>
        )}
      </td>
    </tr>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

type StatusFilter = 'pending' | 'posted' | 'rejected' | 'all';

export default function LoanRepaymentApprovalsPage() {
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [rejectTarget, setRejectTarget] = useState<LoanRepaymentRequest | null>(null);

  const params = filter === 'all' ? {} : { status: filter };
  const { data: requests = [], isLoading: loading, error: queryError, refetch } = useLoanRepaymentApprovals(params);
  const approveMutation = useApproveRepaymentRequest();
  const rejectMutation = useRejectRepaymentRequest();

  const handleApprove = async (id: number) => {
    approveMutation.mutate(id, {
      onError: (e: any) => {
        toast.error(e?.detail ?? e?.message ?? 'Approval failed.');
      },
    });
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTarget) return;
    rejectMutation.mutate(
      { id: rejectTarget.id, rejection_reason: reason },
      {
        onSuccess: () => setRejectTarget(null),
        onError: (e: any) => {
          toast.error(e?.detail ?? e?.message ?? 'Rejection failed.');
        },
      }
    );
  };

  const error = queryError ? ((queryError as any)?.detail ?? queryError.message ?? 'Failed to load requests.') : null;
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link to="/loans" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <PiggyBank size={20} className="text-green-600" />
              <h1 className="text-xl font-bold text-gray-900">Repayment Approvals</h1>
              {pendingCount > 0 && (
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                  {pendingCount} pending
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">Savings-debit repayment requests awaiting director approval</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div className="mt-4 flex gap-1">
          {(['pending', 'posted', 'rejected', 'all'] as StatusFilter[]).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === s
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-6">
        {actionError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={16} />
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-gray-400" size={32} />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <AlertCircle className="mx-auto mb-3 text-red-500" size={32} />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <Clock className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-sm text-gray-500">No {filter === 'all' ? '' : filter} requests.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Client / Loan</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Savings Acct</th>
                  <th className="px-4 py-3">Pay Date</th>
                  <th className="px-4 py-3">Requested By</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map(req => (
                  <RequestRow
                    key={req.id}
                    req={req}
                    onApprove={handleApprove}
                    onReject={setRejectTarget}
                    isApproving={approveMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejectTarget && (
        <RejectModal
          request={rejectTarget}
          onConfirm={handleRejectConfirm}
          onClose={() => setRejectTarget(null)}
          loading={rejectMutation.isPending}
        />
      )}
    </div>
  );
}
