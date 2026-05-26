import React, { useState } from 'react';
import {
  ArrowLeft,
  Send,
  CheckCircle,
  XCircle,
  Package,
  Ban,
  FileText,
  User,
  Calendar,
  DollarSign,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../hooks/useToast';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import {
  useMaterialRequest,
  useSubmitMaterialRequest,
  useApproveMaterialRequest,
  useRejectMaterialRequest,
  useFulfillMaterialRequest,
  useCancelMaterialRequest,
  useCheckMaterialRequestStock,
} from '../../hooks/useLedger';
import { MaterialRequest, MaterialRequestActionData } from '../../types/ledger';

type MaterialRequestStatus = MaterialRequest['status'];

const STATUS_COLORS: Record<MaterialRequestStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  submitted: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  fulfilled: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-orange-100 text-orange-800',
};

const MaterialRequestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { canUserApprove } = useApprovalGuard();

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [actionComment, setActionComment] = useState('');
  const [fulfillErrors, setFulfillErrors] = useState<string[]>([]);

  const requestId = parseInt(id || '0');
  const { data: request, isLoading, refetch } = useMaterialRequest(requestId, !!id);

  // Auto-check stock availability whenever the request is in 'approved' state
  const isApproved = request?.status === 'approved';
  const {
    data: stockCheck,
    isLoading: stockCheckLoading,
    refetch: refetchStockCheck,
  } = useCheckMaterialRequestStock(requestId, isApproved);

  const stockInsufficient = isApproved && stockCheck != null && !stockCheck.can_fulfill;

  const submitMutation = useSubmitMaterialRequest();
  const approveMutation = useApproveMaterialRequest();
  const rejectMutation = useRejectMaterialRequest();
  const fulfillMutation = useFulfillMaterialRequest();
  const cancelMutation = useCancelMaterialRequest();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSubmit = async () => {
    if (!request) return;
    try {
      await submitMutation.mutateAsync(request.id);
      success('Material request submitted for approval');
      refetch();
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to submit material request');
    }
  };

  const handleApprove = async () => {
    if (!request) return;
    try {
      const data: MaterialRequestActionData = {
        notes: actionComment,
      };
      await approveMutation.mutateAsync({ id: request.id, data });
      success('Material request approved');
      setShowApprovalModal(false);
      setActionComment('');
      refetch();
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to approve material request');
    }
  };

  const handleReject = async () => {
    if (!request) return;
    if (!actionComment.trim()) {
      showError('Please provide a reason for rejection');
      return;
    }
    try {
      const data: MaterialRequestActionData = {
        reason: actionComment,
      };
      await rejectMutation.mutateAsync({ id: request.id, data });
      success('Material request rejected');
      setShowRejectionModal(false);
      setActionComment('');
      refetch();
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to reject material request');
    }
  };

  const handleFulfill = async () => {
    if (!request) return;

    // Block if we already know stock is insufficient
    if (stockInsufficient) {
      setFulfillErrors(stockCheck?.errors || ['Insufficient stock to fulfill this request.']);
      showError('Cannot fulfill: insufficient stock. See details below.');
      return;
    }

    if (
      !window.confirm(
        'Are you sure you want to fulfill this request? This will create an inventory invoice and reduce stock levels.'
      )
    ) {
      return;
    }

    setFulfillErrors([]);
    try {
      await fulfillMutation.mutateAsync(request.id);
      success('Material request fulfilled successfully');
      refetch();
    } catch (error: any) {
      // Server may return a multi-line error string — split into bullet points
      const raw: string =
        error.response?.data?.error || error.message || 'Failed to fulfill material request';
      const lines = raw
        .split('\n')
        .map((l: string) => l.trim())
        .filter(Boolean);
      setFulfillErrors(lines);
      showError(lines[0] || 'Failed to fulfill material request');
      // Refresh stock check so UI reflects current reality
      refetchStockCheck();
    }
  };

  const handleCancel = async () => {
    if (!request) return;
    if (!window.confirm('Are you sure you want to cancel this request?')) {
      return;
    }
    try {
      await cancelMutation.mutateAsync(request.id);
      success('Material request cancelled');
      refetch();
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to cancel material request');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Material request not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/inventory/material-requests')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Material Requests
        </button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Material Request MR-{request.id.toString().padStart(5, '0')}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  STATUS_COLORS[request.status]
                }`}
              >
                {request.status.replace('_', ' ').toUpperCase()}
              </span>
              <span className="text-gray-600">Created {formatDate(request.created_at)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {request.status === 'draft' && (
              <button
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                <Send className="w-4 h-4 mr-2" />
                Submit for Approval
              </button>
            )}

            {canUserApprove && request.status === 'submitted' && (
              <>
                <button
                  onClick={() => setShowApprovalModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </button>
                <button
                  onClick={() => setShowRejectionModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </button>
              </>
            )}

            {request.status === 'approved' && (
              <button
                onClick={handleFulfill}
                disabled={fulfillMutation.isPending || stockCheckLoading || stockInsufficient}
                title={stockInsufficient ? 'Insufficient stock — see details below' : undefined}
                className={`inline-flex items-center px-4 py-2 rounded-lg transition disabled:opacity-50 ${
                  stockInsufficient
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {stockCheckLoading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : stockInsufficient ? (
                  <AlertTriangle className="w-4 h-4 mr-2" />
                ) : (
                  <Package className="w-4 h-4 mr-2" />
                )}
                {stockCheckLoading
                  ? 'Checking Stock…'
                  : stockInsufficient
                    ? 'Insufficient Stock'
                    : 'Fulfill Request'}
              </button>
            )}

            {(request.status === 'draft' || request.status === 'submitted') && (
              <button
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
                className="inline-flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50"
              >
                <Ban className="w-4 h-4 mr-2" />
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stock Availability Panel — shown while approved */}
          {isApproved && (
            <div
              className={`rounded-lg border p-4 ${
                stockCheckLoading
                  ? 'bg-gray-50 border-gray-200'
                  : stockInsufficient
                    ? 'bg-red-50 border-red-300'
                    : stockCheck
                      ? 'bg-green-50 border-green-300'
                      : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {stockCheckLoading ? (
                    <RefreshCw className="w-5 h-5 text-gray-500 animate-spin" />
                  ) : stockInsufficient ? (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  )}
                  <h3 className="font-semibold text-sm">
                    {stockCheckLoading
                      ? 'Checking stock availability…'
                      : stockInsufficient
                        ? 'Insufficient stock — cannot fulfill'
                        : stockCheck
                          ? `Stock available at ${stockCheck.location?.name}`
                          : 'Stock availability'}
                  </h3>
                </div>
                {!stockCheckLoading && (
                  <button
                    onClick={() => refetchStockCheck()}
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                )}
              </div>

              {stockCheck && !stockCheckLoading && (
                <div className="space-y-2">
                  {stockCheck.items.map(si => (
                    <div
                      key={si.item_id}
                      className={`flex items-center justify-between text-sm rounded px-3 py-2 ${
                        si.status === 'available'
                          ? 'bg-green-100'
                          : si.status === 'insufficient'
                            ? 'bg-red-100'
                            : 'bg-yellow-100'
                      }`}
                    >
                      <div>
                        <span className="font-medium text-gray-900">{si.item_name}</span>
                        <span className="text-gray-500 ml-2">({si.sku})</span>
                      </div>
                      <div className="text-right whitespace-nowrap ml-4">
                        {si.status === 'not_found' ? (
                          <span className="text-yellow-700 font-medium">No stock record</span>
                        ) : (
                          <span
                            className={`font-medium ${
                              si.status === 'available' ? 'text-green-700' : 'text-red-700'
                            }`}
                          >
                            Need {si.requested} · Available {si.available}
                            {si.reserved > 0 && (
                              <span className="text-gray-500 font-normal">
                                {' '}
                                (on-hand {si.on_hand}, reserved {si.reserved})
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fulfill error details from server */}
          {fulfillErrors.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-red-800 text-sm mb-1">Fulfillment failed</p>
                  <ul className="space-y-1">
                    {fulfillErrors.map((err, i) => (
                      <li key={i} className="text-sm text-red-700">
                        • {err}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Request Items */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Requested Items</h2>
            <div className="space-y-3">
              {request.items.map((item, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center border-b pb-3 last:border-b-0"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{item.item_name}</div>
                    <div className="text-sm text-gray-500">SKU: {item.item_sku}</div>
                    {item.notes && <div className="text-xs text-gray-400 mt-0.5">{item.notes}</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-gray-900">
                      Qty: {item.quantity}
                      {item.unit_of_measure ? ` ${item.unit_of_measure}` : ''}
                    </div>
                    {item.approved_quantity !== null && item.approved_quantity !== undefined && (
                      <div className="text-sm text-green-600">
                        Approved: {item.approved_quantity}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total Items</span>
                <span>
                  {request.total_items} line{request.total_items !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {request.notes && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4">Notes</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{request.notes}</p>
            </div>
          )}

          {/* Approval/Rejection Comments */}
          {(request.approval_notes || request.rejection_reason) && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4">
                {request.status === 'approved' ? 'Approval' : 'Rejection'} Comments
              </h2>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-700">
                  {request.approval_notes || request.rejection_reason}
                </p>
                <div className="mt-2 text-sm text-gray-500">
                  By {request.approved_by_name || request.rejected_by_name} on{' '}
                  {formatDate(
                    (request.approved_at || request.rejected_at || request.created_at) as string
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Fulfillment Info */}
          {request.status === 'fulfilled' && request.inventory_invoice && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3" />
                <div>
                  <p className="font-medium text-green-900">Request Fulfilled</p>
                  <p className="text-sm text-green-700 mt-1">
                    Inventory Invoice:{' '}
                    <button
                      onClick={() => navigate(`/inventory/invoices/${request.inventory_invoice}`)}
                      className="text-green-800 underline hover:text-green-900"
                    >
                      #{request.inventory_invoice_number}
                    </button>
                  </p>
                  <p className="text-sm text-green-700">
                    Fulfilled on {formatDate(request.fulfilled_at || request.updated_at)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Client Information */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Client Information</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Client</p>
                <p className="font-medium text-gray-900">{request.client_name}</p>
              </div>
            </div>
          </div>

          {/* Service Invoice */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Authorization</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Service Invoice</p>
                {request.service_invoice ? (
                  <button
                    onClick={() => navigate(`/invoices/${request.service_invoice}`)}
                    className="font-medium text-blue-600 hover:text-blue-800"
                  >
                    #{request.service_invoice_number}
                  </button>
                ) : (
                  <p className="font-medium text-gray-400">No invoice linked</p>
                )}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Timeline</h2>
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Created</p>
                  <p className="text-sm text-gray-600">{formatDate(request.created_at)}</p>
                  <p className="text-xs text-gray-500">By {request.requested_by_name}</p>
                </div>
              </div>

              {request.submitted_at && (
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">Submitted</p>
                    <p className="text-sm text-gray-600">{formatDate(request.submitted_at)}</p>
                  </div>
                </div>
              )}

              {request.approved_at && (
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">Approved</p>
                    <p className="text-sm text-gray-600">{formatDate(request.approved_at)}</p>
                    <p className="text-xs text-gray-500">By {request.approved_by_name}</p>
                  </div>
                </div>
              )}

              {request.rejected_at && (
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">Rejected</p>
                    <p className="text-sm text-gray-600">{formatDate(request.rejected_at)}</p>
                    <p className="text-xs text-gray-500">By {request.rejected_by_name}</p>
                  </div>
                </div>
              )}

              {request.status === 'cancelled' && (
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">Cancelled</p>
                    <p className="text-sm text-gray-600">{formatDate(request.updated_at)}</p>
                  </div>
                </div>
              )}

              {request.status === 'cancelled' && (
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">Cancelled</p>
                    <p className="text-sm text-gray-600">{formatDate(request.updated_at)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Approve Material Request</h2>
              <p className="text-gray-600 mb-4">
                Are you sure you want to approve this material request?
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comment (Optional)
                </label>
                <textarea
                  value={actionComment}
                  onChange={e => setActionComment(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Add any notes about this approval..."
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowApprovalModal(false);
                    setActionComment('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                  disabled={approveMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                >
                  {approveMutation.isPending ? 'Approving...' : 'Approve Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Reject Material Request</h2>
              <p className="text-gray-600 mb-4">
                Please provide a reason for rejecting this material request.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Rejection <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={actionComment}
                  onChange={e => setActionComment(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Explain why this request is being rejected..."
                  required
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowRejectionModal(false);
                    setActionComment('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                  disabled={rejectMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejectMutation.isPending || !actionComment.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                >
                  {rejectMutation.isPending ? 'Rejecting...' : 'Reject Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialRequestDetail;
