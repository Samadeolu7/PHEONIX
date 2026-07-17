/**
 * Director's inbox for loan restructure proposals.
 * Lists pending requests; director can approve or reject each.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { loanService, LoanRestructureRequest } from '../../services/loanService';
import { ClientAvatar } from '../../components/ui/ClientAvatar';

function fmt(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_BADGE: Record<LoanRestructureRequest['status'], string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

// ── Reject modal ────────────────────────────────────────────────────────────

interface RejectModalProps {
  request: LoanRestructureRequest;
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
          {request.client_name} — {request.loan_number}. Rejecting leaves the loan exactly as it is.
        </p>
        <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="rejection-reason">
          Reason for rejection
        </label>
        <textarea
          id="rejection-reason"
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="Explain why this proposal is being rejected…"
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

// ── Row ──────────────────────────────────────────────────────────────────────

interface RequestRowProps {
  req: LoanRestructureRequest;
  onApprove: (id: number) => void;
  onReject: (req: LoanRestructureRequest) => void;
  actionLoading: number | null;
}

function RequestRow({ req, onApprove, onReject, actionLoading }: RequestRowProps) {
  const isLoading = actionLoading === req.id;
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
      <td className="px-4 py-3 text-xs text-gray-600">
        <p>{req.current_term} → {req.new_term} {req.current_term_unit}</p>
        <p className="text-gray-400">at {req.current_interest_rate}%{req.preview ? ` → ${req.preview.new_interest_rate}%` : ''}</p>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
        ₦{fmt(req.outstanding_principal)}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        {req.preview ? (
          <>
            <p>Normal: ₦{fmt(req.preview.normal_interest_amount)}</p>
            <p className="text-amber-600">Restructure income: ₦{fmt(req.preview.restructure_interest_amount)}</p>
          </>
        ) : (
          <span className="text-gray-400">—</span>
        )}
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
              disabled={isLoading}
              onClick={() => onApprove(req.id)}
              className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              Approve
            </button>
            <button
              type="button"
              disabled={isLoading}
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

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

export default function LoanRestructureApprovalsPage() {
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [requests, setRequests] = useState<LoanRestructureRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<LoanRestructureRequest | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filter === 'all' ? {} : { status: filter };
      const data = await loanService.listRestructureRequests(params);
      setRequests(data);
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    setActionError(null);
    try {
      const updated = await loanService.approveRestructureRequest(id);
      setRequests(prev => prev.map(r => (r.id === id ? updated : r)));
    } catch (e: any) {
      const data = e?.response?.data;
      setActionError(data?.detail ?? e?.detail ?? e?.message ?? 'Approval failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTarget) return;
    setRejectLoading(true);
    setActionError(null);
    try {
      const updated = await loanService.rejectRestructureRequest(rejectTarget.id, reason);
      setRequests(prev => prev.map(r => (r.id === rejectTarget.id ? updated : r)));
      setRejectTarget(null);
    } catch (e: any) {
      const data = e?.response?.data;
      setActionError(data?.detail ?? e?.detail ?? e?.message ?? 'Rejection failed.');
    } finally {
      setRejectLoading(false);
    }
  };

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
              <RotateCcw size={20} className="text-amber-600" />
              <h1 className="text-xl font-bold text-gray-900">Restructure Approvals</h1>
              {pendingCount > 0 && (
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                  {pendingCount} pending
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">Loan restructure proposals awaiting director approval</p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div className="mt-4 flex gap-1">
          {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === s
                  ? 'bg-amber-600 text-white'
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
                  <th className="px-4 py-3">Term / Rate</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3">Interest Split (est.)</th>
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
                    actionLoading={actionLoading}
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
          loading={rejectLoading}
        />
      )}
    </div>
  );
}
