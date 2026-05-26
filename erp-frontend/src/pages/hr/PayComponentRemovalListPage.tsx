import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  usePayComponentRemovals,
  useApprovePayComponentRemoval,
  useRejectPayComponentRemoval,
} from '../../hooks/useSalaryComponents';
import { useToast } from '../../contexts/ToastContext';
import { PayComponentRemovalRequest } from '../../types/salaryComponent';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

const PayComponentRemovalListPage: React.FC = () => {
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const { data, isLoading, error, refetch } = usePayComponentRemovals({
    status: statusFilter || undefined,
  });

  const approveMutation = useApprovePayComponentRemoval();
  const rejectMutation = useRejectPayComponentRemoval();

  const handleApprove = async (request: PayComponentRemovalRequest) => {
    if (
      !window.confirm(
        `Approve removal of "${request.component_name}" from ${request.staff_name}?\n\nThis will immediately remove the component from their pay structure.`
      )
    ) {
      return;
    }
    approveMutation.mutate(request.id);
  };

  const handleRejectOpen = (request: PayComponentRemovalRequest) => {
    setRejectionReason('');
    setRejectingId(request.id);
  };

  const handleRejectSubmit = () => {
    if (!rejectingId || !rejectionReason.trim()) {
      showError('Please provide a reason for rejection');
      return;
    }
    rejectMutation.mutate(
      { id: rejectingId, rejectionReason: rejectionReason.trim() },
      {
        onSuccess: () => {
          setRejectingId(null);
          setRejectionReason('');
        },
      }
    );
  };

  const requests = data?.results ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Component Removal Requests</h1>
          <p className="text-gray-600 mt-1">
            Review and approve requests to remove salary components from staff profiles.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          title="Refresh"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {['PENDING', 'APPROVED', 'REJECTED', ''].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === s
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {s === '' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load removal requests.</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">
            No {statusFilter ? STATUS_LABELS[statusFilter].toLowerCase() : ''} removal requests
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(req => (
            <div key={req.id} className="bg-white rounded-lg border shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                {/* Left: info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-gray-900">{req.reference_number}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status]}`}
                    >
                      {STATUS_LABELS[req.status]}
                    </span>
                    <span
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        req.component_type === 'EARNING'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {req.component_type === 'EARNING' ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {req.component_type}
                    </span>
                  </div>

                  <p className="text-sm text-gray-800">
                    Remove <strong>{req.component_name}</strong> from{' '}
                    <button
                      onClick={() => navigate(`/hr/staff/${req.staff_id}/pay-components`)}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {req.staff_name}
                    </button>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Current amount:{' '}
                    {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
                      parseFloat(req.current_amount)
                    )}
                  </p>

                  <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 border-l-4 border-gray-300">
                    <span className="font-medium text-gray-600 text-xs uppercase tracking-wide block mb-0.5">
                      Reason
                    </span>
                    {req.reason}
                  </div>

                  {req.rejection_reason && (
                    <div className="mt-2 p-3 bg-red-50 rounded-lg text-sm text-red-700 border-l-4 border-red-400">
                      <span className="font-medium text-xs uppercase tracking-wide block mb-0.5">
                        Rejection Reason
                      </span>
                      {req.rejection_reason}
                    </div>
                  )}

                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Requested {new Date(req.requested_date).toLocaleDateString()} by{' '}
                      {req.requested_by_name}
                    </span>
                    {req.approved_date && (
                      <span>
                        {req.status === 'APPROVED' ? 'Approved' : 'Reviewed'}{' '}
                        {new Date(req.approved_date).toLocaleDateString()} by {req.approved_by_name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: action buttons (PENDING only) */}
                {req.status === 'PENDING' && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => handleApprove(req)}
                      disabled={approveMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleRejectOpen(req)}
                      disabled={rejectMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectingId !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-3 text-red-700">Reject Removal Request</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for rejection <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 text-sm"
                placeholder="Explain why this removal request is being rejected..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRejectingId(null);
                  setRejectionReason('');
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectionReason.trim() || rejectMutation.isPending}
                onClick={handleRejectSubmit}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
              >
                {rejectMutation.isPending ? 'Submitting…' : 'Reject Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayComponentRemovalListPage;
