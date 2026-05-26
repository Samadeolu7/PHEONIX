import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Package,
  MapPin,
  User,
  Calendar,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  DollarSign,
  FileText,
  MessageSquare,
} from 'lucide-react';
import {
  useStockAdjustment,
  useApproveStockAdjustment,
  useRejectStockAdjustment,
  useExecuteStockAdjustment,
} from '../../hooks/useInventory';
import { useToast } from '../../hooks/useToast';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';

// Status display mapping
const STATUS_LABELS = {
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Executed',
};

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  executed: 'bg-green-100 text-green-800 border-green-200',
};

const STATUS_ICONS = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  executed: CheckCircle,
};

export default function StockAdjustmentDetailPage() {
  const navigate = useNavigate();
  const { canUserApprove } = useApprovalGuard();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [approvalNotes, setApprovalNotes] = useState('');
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'execute'>('approve');

  const adjustmentId = parseInt(id || '0');

  const { data: adjustment, isLoading, error } = useStockAdjustment(adjustmentId);
  const approveMutation = useApproveStockAdjustment();
  const rejectMutation = useRejectStockAdjustment();
  const executeMutation = useExecuteStockAdjustment();

  const handleApproveReject = async () => {
    if (!adjustment) return;

    try {
      const requestData = {
        requested_by: adjustment.requested_by,
        item: adjustment.item,
        location: adjustment.location,
        adjustment_type: adjustment.adjustment_type,
        quantity: adjustment.quantity,
        unit_cost: adjustment.unit_cost,
        reason: adjustment.reason,
        notes: adjustment.notes,
        status: actionType === 'approve' ? 'approved' : 'rejected',
        approval_notes: approvalNotes.trim() || undefined,
      };

      if (actionType === 'approve') {
        await approveMutation.mutateAsync({ id: adjustmentId, data: requestData });
        toast.success('Stock adjustment approved successfully!');
      } else {
        await rejectMutation.mutateAsync({ id: adjustmentId, data: requestData });
        toast.success('Stock adjustment rejected successfully!');
      }

      setShowApprovalModal(false);
      setApprovalNotes('');
    } catch (error) {
      console.error(`Failed to ${actionType} adjustment:`, error);
      toast.error(`Failed to ${actionType} stock adjustment. Please try again.`);
    }
  };

  const handleExecute = async () => {
    if (!adjustment) return;

    try {
      const requestData = {
        requested_by: adjustment.requested_by,
        item: adjustment.item,
        location: adjustment.location,
        adjustment_type: adjustment.adjustment_type,
        quantity: adjustment.quantity,
        unit_cost: adjustment.unit_cost,
        reason: adjustment.reason,
        notes: adjustment.notes,
        status: 'executed',
        approval_notes: adjustment.approval_notes,
      };

      await executeMutation.mutateAsync({ id: adjustmentId, data: requestData });
      toast.success('Stock adjustment executed successfully!');
      setShowExecuteModal(false);
    } catch (error: any) {
      // console.error('Failed to execute adjustment:', error);
      // toast.error('Failed to execute stock adjustment. Please try again.');

      console.error('Failed to execute adjustment:', error);

      // Log more details
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      console.error('Error message:', error.message);

      // Show more specific error message
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        'Failed to execute stock adjustment. Please try again.';
      toast.error(errorMessage);
    }
  };

  const openApprovalModal = (type: 'approve' | 'reject') => {
    setActionType(type);
    setShowApprovalModal(true);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="space-y-4">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !adjustment) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">{error?.message || 'Stock adjustment not found'}</p>
          <button
            onClick={() => navigate('/inventory/adjustments')}
            className="mt-2 text-red-600 hover:text-red-800 underline"
          >
            ← Back to Adjustments
          </button>
        </div>
      </div>
    );
  }

  const StatusIcon = STATUS_ICONS[adjustment.status] || AlertTriangle;
  const isProcessing = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/inventory/adjustments')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock Adjustment Details</h1>
            <p className="text-gray-600">Request #{adjustment.request_number}</p>
          </div>
        </div>

        {/* Action Buttons */}
        {canUserApprove && adjustment.status === 'pending' && (
          <div className="flex gap-2">
            <button
              onClick={() => openApprovalModal('reject')}
              disabled={isProcessing}
              className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
            <button
              onClick={() => openApprovalModal('approve')}
              disabled={isProcessing}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Approve
            </button>
          </div>
        )}

        {/* Execute Button for Approved Adjustments */}
        {adjustment.status === 'approved' && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowExecuteModal(true)}
              disabled={executeMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Execute Adjustment
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status Card */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Status</h2>
              <div
                className={`flex items-center gap-2 px-3 py-1 rounded-full border ${STATUS_COLORS[adjustment.status]}`}
              >
                <StatusIcon className="w-4 h-4" />
                <span className="text-sm font-medium">{STATUS_LABELS[adjustment.status]}</span>
              </div>
            </div>

            {adjustment.approved_by_name && (
              <div className="text-sm text-gray-600">
                <p>
                  <strong>Approved by:</strong> {adjustment.approved_by_name}
                </p>
                {adjustment.approved_at && (
                  <p>
                    <strong>Approved on:</strong>{' '}
                    {new Date(adjustment.approved_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Item & Adjustment Details */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Adjustment Details</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Package className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-500">Item</p>
                    <p className="text-gray-900">{adjustment.item_name}</p>
                    <p className="text-sm text-gray-500">SKU: {adjustment.item_sku}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-500">Location</p>
                    <p className="text-gray-900">{adjustment.location_name}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  {adjustment.adjustment_type === 'increase' ? (
                    <TrendingUp className="w-5 h-5 text-green-600 mt-0.5" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-600 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-500">Adjustment Type</p>
                    <p
                      className={`font-medium ${adjustment.adjustment_type === 'increase' ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {adjustment.adjustment_type === 'increase'
                        ? 'Stock Increase'
                        : 'Stock Decrease'}
                    </p>
                    <p
                      className={`text-lg font-semibold ${adjustment.adjustment_type === 'increase' ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {adjustment.adjustment_type === 'increase' ? '+' : '-'}
                      {adjustment.quantity}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <DollarSign className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-500">Cost</p>
                    {adjustment.unit_cost && (
                      <p className="text-gray-900">
                        Unit Cost: ₦{parseFloat(adjustment.unit_cost).toLocaleString()}
                      </p>
                    )}
                    <p className="text-lg font-semibold text-gray-900">
                      Total: ₦{parseFloat(adjustment.estimated_cost).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Reason & Notes */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Reason & Notes</h2>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-500 mb-1">Reason for Adjustment</p>
                  <p className="text-gray-900">{adjustment.reason}</p>
                </div>
              </div>

              {adjustment.notes && (
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-500 mb-1">Additional Notes</p>
                    <p className="text-gray-900">{adjustment.notes}</p>
                  </div>
                </div>
              )}

              {adjustment.approval_notes && (
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-700 mb-1">Approval Notes</p>
                    <p className="text-blue-900">{adjustment.approval_notes}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Request Information */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Information</h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Requested By</p>
                  <p className="text-gray-900">{adjustment.requested_by_name}</p>
                  <p className="text-sm text-gray-500">ID: {adjustment.requested_by}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Created</p>
                  <p className="text-gray-900">
                    {new Date(adjustment.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(adjustment.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Last Updated</p>
                  <p className="text-gray-900">
                    {new Date(adjustment.updated_at).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(adjustment.updated_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stock Movement Reference */}
          {adjustment.stock_movement && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock Movement</h3>
              <p className="text-sm text-gray-600">
                This adjustment is linked to stock movement #{adjustment.stock_movement}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {actionType === 'approve' ? 'Approve' : 'Reject'} Stock Adjustment
            </h3>

            <p className="text-gray-600 mb-4">
              Are you sure you want to {actionType} this stock adjustment request?
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {actionType === 'approve' ? 'Approval' : 'Rejection'} Notes (Optional)
              </label>
              <textarea
                value={approvalNotes}
                onChange={e => setApprovalNotes(e.target.value)}
                placeholder={`Add ${actionType === 'approve' ? 'approval' : 'rejection'} notes...`}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowApprovalModal(false);
                  setApprovalNotes('');
                }}
                disabled={isProcessing}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveReject}
                disabled={isProcessing}
                className={`px-4 py-2 text-white rounded-md disabled:opacity-50 flex items-center gap-2 ${
                  actionType === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    {actionType === 'approve' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    {actionType === 'approve' ? 'Approve' : 'Reject'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execute Modal */}
      {showExecuteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Execute Stock Adjustment</h3>

            <div className="mb-4">
              <p className="text-gray-600 mb-3">
                Are you sure you want to execute this stock adjustment? This action will:
              </p>
              <ul className="text-sm text-gray-600 space-y-1 ml-4">
                <li>• Update the actual stock levels</li>
                <li>• Create a stock movement record</li>
                <li>• Mark the adjustment as executed</li>
                <li>• This action cannot be undone</li>
              </ul>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">Warning</p>
                  <p>
                    This will permanently change your inventory levels. Make sure all details are
                    correct before proceeding.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowExecuteModal(false)}
                disabled={executeMutation.isPending}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExecute}
                disabled={executeMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {executeMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Executing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Execute Adjustment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
