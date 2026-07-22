/**
 * Director's inbox for loan disbursement corrections — fixing a loan disbursed
 * to the wrong customer. Always requires two different directors: the first
 * approves, then a second, different director approves and that second
 * approval is what actually executes the reversal + re-disbursement. Neither
 * the requester nor the first approver can act as the second approver.
 *
 * Route: /loans/disbursement-corrections
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { loanService, LoanDisbursementCorrection, CorrectionStatus } from '../../services/loanService';
import { useAuth } from '../../contexts/AuthContext';
import { ClientAvatar } from '../../components/ui/ClientAvatar';
import {
  useLoanDisbursementCorrections,
  useFirstApproveCorrection,
  useSecondApproveCorrection,
  useRejectCorrection,
} from '../../hooks/useLoans';

function fmt(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_BADGE: Record<CorrectionStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  awaiting_second_approval: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<CorrectionStatus, string> = {
  pending: 'Pending 1st Approval',
  awaiting_second_approval: 'Awaiting 2nd Approval',
  completed: 'Completed',
  rejected: 'Rejected',
};

// ── Notes modal (used for first-approve, second-approve, and reject) ────────

interface NotesModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  confirmClassName: string;
  onConfirm: (notes: string) => void;
  onClose: () => void;
  loading: boolean;
}

function NotesModal({ title, description, confirmLabel, confirmClassName, onConfirm, onClose, loading }: NotesModalProps) {
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-gray-900">{title}</h2>
        <p className="mb-4 text-sm text-gray-500">{description}</p>
        <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="corr-notes">
          Notes (at least 10 characters — becomes part of the audit trail)
        </label>
        <textarea
          id="corr-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" disabled={loading || notes.trim().length < 10}
            onClick={() => onConfirm(notes.trim())}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${confirmClassName}`}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────

interface RowProps {
  req: LoanDisbursementCorrection;
  currentUserId: number | undefined;
  onFirstApprove: (req: LoanDisbursementCorrection) => void;
  onSecondApprove: (req: LoanDisbursementCorrection) => void;
  onReject: (req: LoanDisbursementCorrection) => void;
}

function Row({ req, currentUserId, onFirstApprove, onSecondApprove, onReject }: RowProps) {
  const isRequester = req.requested_by === currentUserId;
  const isFirstApprover = req.first_approved_by === currentUserId;

  return (
    <tr className="hover:bg-gray-50 align-top">
      <td className="px-4 py-3 font-mono text-xs text-gray-500">{req.reference_number}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <ClientAvatar image={req.wrong_client_image} name={req.wrong_client_name} size="xs" />
          <span className="text-sm text-gray-900">{req.wrong_client_name}</span>
          <span className="text-xs text-gray-400">({req.original_loan_number})</span>
        </div>
        <div className="flex items-center gap-2 pl-1 text-xs text-gray-400">
          <span>→</span>
          <ClientAvatar image={req.correct_client_image} name={req.correct_client_name} size="xs" />
          <span className="font-medium text-gray-700">{req.correct_client_name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">₦{fmt(req.disbursed_amount)}</td>
      <td className="px-4 py-3 max-w-xs text-xs text-gray-600">{req.reason}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[req.status]}`}>
          {STATUS_LABEL[req.status]}
        </span>
        <p className="mt-1 text-xs text-gray-400">Requested by {req.requested_by_name ?? '—'}</p>
        {req.first_approved_by_name && (
          <p className="text-xs text-gray-400">1st: {req.first_approved_by_name}</p>
        )}
        {req.second_approved_by_name && (
          <p className="text-xs text-gray-400">2nd: {req.second_approved_by_name}</p>
        )}
        {req.status === 'completed' && req.new_loan_number && (
          <p className="mt-1 text-xs font-medium text-green-700">New loan: {req.new_loan_number}</p>
        )}
        {req.status === 'rejected' && (
          <p className="mt-1 text-xs text-red-600">{req.rejection_reason}</p>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {req.status === 'pending' && (
          isRequester ? (
            <span className="text-xs text-gray-400" title="Maker-checker: you requested this correction">
              Awaiting another director
            </span>
          ) : (
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => onFirstApprove(req)}
                className="flex items-center gap-1 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50">
                <CheckCircle size={12} />
                1st Approve
              </button>
              <button type="button" onClick={() => onReject(req)}
                className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                <XCircle size={12} />
                Reject
              </button>
            </div>
          )
        )}
        {req.status === 'awaiting_second_approval' && (
          isRequester || isFirstApprover ? (
            <span className="text-xs text-gray-400" title="Maker-checker: a different director must give the second approval">
              Awaiting a different director
            </span>
          ) : (
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => onSecondApprove(req)}
                className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">
                <ShieldAlert size={12} />
                2nd Approve &amp; Execute
              </button>
              <button type="button" onClick={() => onReject(req)}
                className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                <XCircle size={12} />
                Reject
              </button>
            </div>
          )
        )}
        {(req.status === 'completed' || req.status === 'rejected') && (
          <p className="text-xs text-gray-400">{fmtDate(req.updated_at)}</p>
        )}
      </td>
    </tr>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

type StatusFilter = 'pending' | 'awaiting_second_approval' | 'completed' | 'rejected' | 'all';

export default function LoanDisbursementCorrectionsPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [modal, setModal] = useState<{ req: LoanDisbursementCorrection; kind: 'first' | 'second' | 'reject' } | null>(null);

  // React Query hooks
  const { data: requests = [], isLoading: loading, error: queryError, refetch } = useLoanDisbursementCorrections(
    filter === 'all' ? {} : { status: filter }
  );
  const firstApproveMutation = useFirstApproveCorrection();
  const secondApproveMutation = useSecondApproveCorrection();
  const rejectMutation = useRejectCorrection();

  const error = queryError ? (queryError as any)?.response?.data?.detail ?? queryError.message ?? 'Failed to load corrections.' : null;

  const handleConfirm = async (notes: string) => {
    if (!modal) return;
    const mutation = modal.kind === 'first'
      ? firstApproveMutation
      : modal.kind === 'second'
        ? secondApproveMutation
        : rejectMutation;

    const payload = modal.kind === 'reject'
      ? { id: modal.req.id, rejection_reason: notes }
      : { id: modal.req.id, notes };

    mutation.mutate(payload as any, {
      onSuccess: () => setModal(null),
      onError: (e: any) => {
        const data = e?.response?.data;
        // error is handled by mutation state
      },
    });
  };

  const actionLoading = firstApproveMutation.isPending || secondApproveMutation.isPending || rejectMutation.isPending;
  const actionError = (firstApproveMutation.error as any)?.response?.data?.detail
    || firstApproveMutation.error?.message
    || (secondApproveMutation.error as any)?.response?.data?.detail
    || secondApproveMutation.error?.message
    || (rejectMutation.error as any)?.response?.data?.detail
    || rejectMutation.error?.message
    || null;

  const pendingCount = requests.filter(r => r.status === 'pending' || r.status === 'awaiting_second_approval').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link to="/loans" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <ShieldAlert size={20} className="text-red-600" />
              <h1 className="text-xl font-bold text-gray-900">Disbursement Corrections</h1>
              {pendingCount > 0 && (
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                  {pendingCount} awaiting action
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              Loans disbursed to the wrong customer — always requires two different directors.
            </p>
          </div>
          <button type="button" onClick={() => refetch()} disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="mt-4 flex gap-1">
          {(['pending', 'awaiting_second_approval', 'completed', 'rejected', 'all'] as StatusFilter[]).map(s => (
            <button key={s} type="button" onClick={() => setFilter(s)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === s ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
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
            <p className="text-sm text-gray-500">No {filter === 'all' ? '' : STATUS_LABEL[filter as CorrectionStatus]?.toLowerCase() ?? ''} corrections.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3">Wrong → Correct Customer</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map(req => (
                  <Row
                    key={req.id}
                    req={req}
                    currentUserId={user?.id}
                    onFirstApprove={r => setModal({ req: r, kind: 'first' })}
                    onSecondApprove={r => setModal({ req: r, kind: 'second' })}
                    onReject={r => setModal({ req: r, kind: 'reject' })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && modal.kind === 'first' && (
        <NotesModal
          title={`First Approval — ${modal.req.reference_number}`}
          description={`Reverse ${modal.req.wrong_client_name}'s disbursement and re-disburse to ${modal.req.correct_client_name}? A second, different director must confirm before anything actually happens.`}
          confirmLabel="Give First Approval"
          confirmClassName="bg-blue-600 hover:bg-blue-700"
          loading={actionLoading}
          onClose={() => setModal(null)}
          onConfirm={handleConfirm}
        />
      )}
      {modal && modal.kind === 'second' && (
        <NotesModal
          title={`Second Approval — ${modal.req.reference_number}`}
          description={`This executes immediately: ${modal.req.wrong_client_name}'s disbursement (₦${fmt(modal.req.disbursed_amount)}) is reversed and a new loan is disbursed to ${modal.req.correct_client_name}. This cannot be undone through this workflow.`}
          confirmLabel="Confirm & Execute"
          confirmClassName="bg-red-600 hover:bg-red-700"
          loading={actionLoading}
          onClose={() => setModal(null)}
          onConfirm={handleConfirm}
        />
      )}
      {modal && modal.kind === 'reject' && (
        <NotesModal
          title={`Reject — ${modal.req.reference_number}`}
          description="The original loan is left exactly as it is."
          confirmLabel="Reject"
          confirmClassName="bg-red-600 hover:bg-red-700"
          loading={actionLoading}
          onClose={() => setModal(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
