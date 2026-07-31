import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  MapPin,
  Package,
  User,
  Calendar,
  FileText,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { inventoryService } from '../../services/inventoryService';
import { useAuth } from '../../contexts/AuthContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending: {
    label: 'Pending Approval',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
    icon: CheckCircle,
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
    icon: XCircle,
  },
  dispatched: {
    label: 'In Transit',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50 border-indigo-200',
    icon: Truck,
  },
  acknowledged: {
    label: 'Acknowledged',
    color: 'text-green-700',
    bg: 'bg-green-50 border-green-200',
    icon: CheckCircle,
  },
  short_received: {
    label: 'Short Received',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    icon: AlertTriangle,
  },
  disputed: {
    label: 'Disputed',
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
    icon: AlertTriangle,
  },
  executed: {
    label: 'Executed (Legacy)',
    color: 'text-green-700',
    bg: 'bg-green-50 border-green-200',
    icon: Truck,
  },
};

const StockTransferDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [actionNotes, setActionNotes] = useState('');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showAcknowledgeModal, setShowAcknowledgeModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [actualQuantityReceived, setActualQuantityReceived] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const {
    data: transfer,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['stockTransfer', id],
    queryFn: () => inventoryService.getStockTransfer(Number(id)),
    enabled: !!id,
  });

  const formatDate = (d: string | null) => (d ? new Date(d).toLocaleString('en-GB') : '—');
  const formatCurrency = (amt: string | null | undefined) => {
    if (!amt) return '—';
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amt));
  };

  const handleApprove = async () => {
    if (!transfer) return;
    setSubmitting(true);
    try {
      await inventoryService.approveStockTransfer(transfer.id, actionNotes || undefined);
      toast.success('Transfer approved successfully');
      queryClient.invalidateQueries({ queryKey: ['stockTransfer', id] });
      setShowApproveModal(false);
      setActionNotes('');
    } catch {
      toast.error('Failed to approve transfer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!transfer) return;
    setSubmitting(true);
    try {
      await inventoryService.rejectStockTransfer(transfer.id, actionNotes || undefined);
      toast.success('Transfer rejected');
      queryClient.invalidateQueries({ queryKey: ['stockTransfer', id] });
      setShowRejectModal(false);
      setActionNotes('');
    } catch {
      toast.error('Failed to reject transfer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispatch = async () => {
    if (!transfer) return;
    setSubmitting(true);
    try {
      await inventoryService.dispatchStockTransfer(transfer.id, actionNotes || undefined);
      toast.success('Transfer dispatched — now in transit');
      queryClient.invalidateQueries({ queryKey: ['stockTransfer', id] });
      setShowDispatchModal(false);
      setActionNotes('');
    } catch {
      toast.error('Failed to dispatch transfer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!transfer) return;
    setSubmitting(true);
    try {
      await inventoryService.acknowledgeStockTransfer(
        transfer.id,
        actualQuantityReceived || undefined,
        actionNotes || undefined
      );
      toast.success('Transfer acknowledged');
      queryClient.invalidateQueries({ queryKey: ['stockTransfer', id] });
      setShowAcknowledgeModal(false);
      setActionNotes('');
      setActualQuantityReceived('');
    } catch {
      toast.error('Failed to acknowledge transfer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispute = async () => {
    if (!transfer) return;
    if (!actionNotes.trim()) {
      toast.error('A dispute reason is required');
      return;
    }
    setSubmitting(true);
    try {
      await inventoryService.disputeStockTransfer(transfer.id, actionNotes);
      toast.success('Transfer disputed');
      queryClient.invalidateQueries({ queryKey: ['stockTransfer', id] });
      setShowDisputeModal(false);
      setActionNotes('');
    } catch {
      toast.error('Failed to dispute transfer');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error || !transfer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-3" />
        <p className="text-gray-600">Transfer not found</p>
        <Link to="/inventory/transfers" className="text-blue-600 text-sm mt-2 hover:underline">
          Back to list
        </Link>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[transfer.status] || STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <Link
        to="/inventory/transfers"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Transfers
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-7 h-7 text-blue-600" />
            {transfer.request_number}
          </h1>
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 mt-2 rounded-full border text-sm font-medium ${cfg.bg} ${cfg.color}`}
          >
            <StatusIcon className="w-4 h-4" />
            {cfg.label}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {transfer.status === 'pending' && isAdmin && (
            <>
              <button
                onClick={() => setShowApproveModal(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Reject
              </button>
            </>
          )}
          {transfer.status === 'approved' && isAdmin && (
            <button
              onClick={() => setShowDispatchModal(true)}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Truck className="w-4 h-4" />
              Dispatch
            </button>
          )}
          {transfer.status === 'dispatched' && isAdmin && (
            <>
              <button
                onClick={() => {
                  setActualQuantityReceived(transfer.quantity);
                  setShowAcknowledgeModal(true);
                }}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
              >
                <CheckCircle className="w-4 h-4" />
                Acknowledge Receipt
              </button>
              <button
                onClick={() => setShowDisputeModal(true)}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
              >
                <AlertTriangle className="w-4 h-4" />
                Dispute
              </button>
            </>
          )}
        </div>
      </div>

      {/* Detail Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Item Info */}
        <div className="bg-white border rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Item Details
          </h3>
          <div className="flex items-start gap-3">
            <Package className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">{transfer.item_name}</p>
              <p className="text-sm text-gray-500">SKU: {transfer.item_sku}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div>
              <p className="text-xs text-gray-500">Quantity</p>
              <p className="text-lg font-semibold">
                {parseFloat(transfer.quantity).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Estimated Cost</p>
              <p className="text-lg font-semibold">{formatCurrency(transfer.estimated_cost)}</p>
            </div>
          </div>
          {transfer.unit_cost && (
            <div>
              <p className="text-xs text-gray-500">Unit Cost</p>
              <p className="text-sm text-gray-700">{formatCurrency(transfer.unit_cost)}</p>
            </div>
          )}
        </div>

        {/* Transfer Route */}
        <div className="bg-white border rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Transfer Route
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <MapPin className="w-5 h-5 text-red-500 mx-auto mb-1" />
              <p className="text-xs text-gray-500">From</p>
              <p className="font-medium text-gray-900">{transfer.from_location_name}</p>
              {transfer.from_branch_name && (
                <p className="text-xs text-gray-400">{transfer.from_branch_name}</p>
              )}
            </div>
            <ArrowLeftRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <MapPin className="w-5 h-5 text-green-500 mx-auto mb-1" />
              <p className="text-xs text-gray-500">To</p>
              <p className="font-medium text-gray-900">{transfer.to_location_name}</p>
              {transfer.to_branch_name && (
                <p className="text-xs text-gray-400">{transfer.to_branch_name}</p>
              )}
            </div>
          </div>
          {transfer.from_branch !== transfer.to_branch && (
            <p className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-1">
              Cross-branch transfer — posts through inter-branch clearing accounts
            </p>
          )}
        </div>
      </div>

      {/* Variance banner */}
      {parseFloat(transfer.variance_quantity || '0') > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-900">Short receipt recorded</p>
            <p className="text-sm text-amber-700">
              Dispatched {parseFloat(transfer.quantity).toLocaleString()}, received{' '}
              {transfer.actual_quantity_received
                ? parseFloat(transfer.actual_quantity_received).toLocaleString()
                : '—'}{' '}
              — a shortfall of {parseFloat(transfer.variance_quantity).toLocaleString()} was
              posted to Transfer Shrinkage.
            </p>
          </div>
        </div>
      )}

      {/* People & Dates */}
      <div className="bg-white border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          People & Timeline
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-2">
            <User className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Requested By</p>
              <p className="text-sm font-medium">{transfer.requested_by_name}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Created</p>
              <p className="text-sm">{formatDate(transfer.created_at)}</p>
            </div>
          </div>
          {transfer.approved_by_name && (
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">
                  {transfer.status === 'rejected' ? 'Rejected By' : 'Approved By'}
                </p>
                <p className="text-sm font-medium">{transfer.approved_by_name}</p>
                <p className="text-xs text-gray-400">{formatDate(transfer.approved_at)}</p>
              </div>
            </div>
          )}
          {transfer.dispatched_by_name && (
            <div className="flex items-start gap-2">
              <Truck className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Dispatched By</p>
                <p className="text-sm font-medium">{transfer.dispatched_by_name}</p>
                <p className="text-xs text-gray-400">{formatDate(transfer.dispatched_at)}</p>
              </div>
            </div>
          )}
          {transfer.acknowledged_by_name && (
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Acknowledged By</p>
                <p className="text-sm font-medium">{transfer.acknowledged_by_name}</p>
                <p className="text-xs text-gray-400">{formatDate(transfer.acknowledged_at)}</p>
              </div>
            </div>
          )}
          {transfer.disputed_by_name && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Disputed By</p>
                <p className="text-sm font-medium">{transfer.disputed_by_name}</p>
                <p className="text-xs text-gray-400">{formatDate(transfer.disputed_at)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reason & Notes */}
      <div className="bg-white border rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Reason &amp; Notes
        </h3>
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500">Reason</p>
            <p className="text-sm text-gray-800">{transfer.reason}</p>
          </div>
        </div>
        {transfer.notes && (
          <div className="pl-6">
            <p className="text-xs text-gray-500">Additional Notes</p>
            <p className="text-sm text-gray-700">{transfer.notes}</p>
          </div>
        )}
        {transfer.approval_notes && (
          <div className="pl-6">
            <p className="text-xs text-gray-500">Approval Notes</p>
            <p className="text-sm text-gray-700">{transfer.approval_notes}</p>
          </div>
        )}
        {transfer.reference_number && (
          <div className="pl-6">
            <p className="text-xs text-gray-500">Reference</p>
            <p className="text-sm text-gray-700">{transfer.reference_number}</p>
          </div>
        )}
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Approve Transfer</h3>
            <p className="text-sm text-gray-500 mb-4">
              This will approve the transfer of{' '}
              <strong>
                {parseFloat(transfer.quantity).toLocaleString()} × {transfer.item_name}
              </strong>{' '}
              from {transfer.from_location_name} to {transfer.to_location_name}.
            </p>
            <textarea
              rows={3}
              value={actionNotes}
              onChange={e => setActionNotes(e.target.value)}
              placeholder="Optional approval notes…"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowApproveModal(false);
                  setActionNotes('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? 'Approving…' : 'Confirm Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reject Transfer</h3>
            <p className="text-sm text-gray-500 mb-4">
              This will reject the transfer request <strong>{transfer.request_number}</strong>.
            </p>
            <textarea
              rows={3}
              value={actionNotes}
              onChange={e => setActionNotes(e.target.value)}
              placeholder="Reason for rejection…"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setActionNotes('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Dispatch Transfer</h3>
            <p className="text-sm text-gray-500 mb-4">
              This will reduce stock at <strong>{transfer.from_location_name}</strong> by{' '}
              <strong>{parseFloat(transfer.quantity).toLocaleString()}</strong> and mark the
              transfer as in transit
              {transfer.from_branch !== transfer.to_branch && ' (posting the inter-branch clearing entry)'}.
            </p>
            <textarea
              rows={3}
              value={actionNotes}
              onChange={e => setActionNotes(e.target.value)}
              placeholder="Optional dispatch notes…"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDispatchModal(false);
                  setActionNotes('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDispatch}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Dispatching…' : 'Confirm Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Acknowledge Modal */}
      {showAcknowledgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Acknowledge Receipt</h3>
            <p className="text-sm text-gray-500 mb-4">
              Confirm how much of <strong>{transfer.item_name}</strong> actually arrived at{' '}
              <strong>{transfer.to_location_name}</strong>. Dispatched quantity:{' '}
              <strong>{parseFloat(transfer.quantity).toLocaleString()}</strong>.
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Actual Quantity Received
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={transfer.quantity}
              value={actualQuantityReceived}
              onChange={e => setActualQuantityReceived(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm mb-3"
            />
            {parseFloat(actualQuantityReceived || '0') < parseFloat(transfer.quantity) && (
              <p className="text-xs text-amber-600 mb-3">
                This is less than the dispatched quantity — the shortfall will be posted
                automatically to Transfer Shrinkage.
              </p>
            )}
            <textarea
              rows={2}
              value={actionNotes}
              onChange={e => setActionNotes(e.target.value)}
              placeholder="Optional notes…"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAcknowledgeModal(false);
                  setActionNotes('');
                  setActualQuantityReceived('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAcknowledge}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? 'Acknowledging…' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Dispute Transfer</h3>
            <p className="text-sm text-gray-500 mb-4">
              Flag a problem with this delivery (wrong item, damaged, etc.) instead of
              acknowledging it. Resolution happens manually — this is terminal for now.
            </p>
            <textarea
              rows={3}
              value={actionNotes}
              onChange={e => setActionNotes(e.target.value)}
              placeholder="Reason for dispute…"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDisputeModal(false);
                  setActionNotes('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDispute}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Disputing…' : 'Confirm Dispute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockTransferDetailPage;
