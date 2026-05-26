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
  executed: {
    label: 'Executed',
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

  const handleExecute = async () => {
    if (!transfer) return;
    setSubmitting(true);
    try {
      await inventoryService.executeStockTransfer(transfer.id);
      toast.success('Transfer executed — stock moved');
      queryClient.invalidateQueries({ queryKey: ['stockTransfer', id] });
    } catch {
      toast.error('Failed to execute transfer');
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
              onClick={handleExecute}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Truck className="w-4 h-4" />
              )}
              Execute Transfer
            </button>
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
            </div>
            <ArrowLeftRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <MapPin className="w-5 h-5 text-green-500 mx-auto mb-1" />
              <p className="text-xs text-gray-500">To</p>
              <p className="font-medium text-gray-900">{transfer.to_location_name}</p>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
};

export default StockTransferDetailPage;
