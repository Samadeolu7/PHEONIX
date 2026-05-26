/**
 * Petty Cash Voucher Detail Page
 * View voucher details and perform workflow actions
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  FileTextIcon,
  ArrowLeftIcon,
  EditIcon,
  CheckCircle2Icon,
  XCircleIcon,
  BanknoteIcon,
  ReceiptIcon,
  TrashIcon,
  SendIcon,
  AlertCircleIcon,
  ClockIcon,
  UserIcon,
} from 'lucide-react';
import {
  usePettyCashVoucher,
  useSubmitVoucher,
  useApproveVoucher,
  useRejectVoucher,
  useDisburseVoucher,
  useRetireVoucher,
  useDeletePettyCashVoucher,
} from '../../hooks/usePettyCash';
import PettyCashReceiptUpload from '../../components/treasury/PettyCashReceiptUpload';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';

const STATUS_INFO = {
  draft: { color: 'bg-gray-100 text-gray-800', icon: ClockIcon, label: 'Draft' },
  pending: { color: 'bg-yellow-100 text-yellow-800', icon: ClockIcon, label: 'Pending Approval' },
  approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle2Icon, label: 'Approved' },
  rejected: { color: 'bg-red-100 text-red-800', icon: XCircleIcon, label: 'Rejected' },
  disbursed: { color: 'bg-blue-100 text-blue-800', icon: BanknoteIcon, label: 'Disbursed' },
  retired: { color: 'bg-purple-100 text-purple-800', icon: CheckCircle2Icon, label: 'Retired' },
  cancelled: { color: 'bg-gray-100 text-gray-600', icon: XCircleIcon, label: 'Cancelled' },
};

export const PettyCashVoucherDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const voucherId = parseInt(id || '0');

  const [actionDialog, setActionDialog] = useState<{
    visible: boolean;
    type: 'approve' | 'reject' | 'disburse' | 'retire' | null;
  }>({ visible: false, type: null });
  const [actionComments, setActionComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch voucher data
  const { data: voucher, isLoading } = usePettyCashVoucher(voucherId);
  const { canUserApprove } = useApprovalGuard();

  // Mutations
  const submitMutation = useSubmitVoucher();
  const approveMutation = useApproveVoucher();
  const rejectMutation = useRejectVoucher();
  const disburseMutation = useDisburseVoucher();
  const retireMutation = useRetireVoucher();
  const deleteMutation = useDeletePettyCashVoucher();

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await submitMutation.mutateAsync(voucherId);
      navigate('/treasury/petty-cash');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit voucher');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async () => {
    if (!actionDialog.type) return;

    setSubmitting(true);
    setError('');
    try {
      const data = { notes: actionComments };

      switch (actionDialog.type) {
        case 'approve':
          await approveMutation.mutateAsync({ id: voucherId, data });
          break;
        case 'reject':
          await rejectMutation.mutateAsync({ id: voucherId, data });
          break;
        case 'disburse':
          await disburseMutation.mutateAsync({ id: voucherId, data });
          break;
        case 'retire':
          await retireMutation.mutateAsync({ id: voucherId, data });
          break;
      }

      setActionDialog({ visible: false, type: null });
      setActionComments('');
    } catch (err: any) {
      setError(err.response?.data?.message || `Failed to ${actionDialog.type} voucher`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this voucher? This action cannot be undone.')) {
      return;
    }

    setSubmitting(true);
    try {
      await deleteMutation.mutateAsync(voucherId);
      navigate('/treasury/petty-cash');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete voucher');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!voucher) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="font-semibold text-red-900">Voucher Not Found</h3>
          <p className="text-sm text-red-700 mt-1">The voucher you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate('/treasury/petty-cash')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_INFO[voucher.status as keyof typeof STATUS_INFO];
  const StatusIcon = statusInfo.icon;

  // Determine available actions based on status
  const canEdit = voucher.status === 'draft';
  const canSubmit = voucher.status === 'draft';
  const canApprove = canUserApprove && voucher.status === 'pending';
  const canReject = canUserApprove && voucher.status === 'pending';
  const canDisburse = canUserApprove && voucher.status === 'approved';
  const canRetire = voucher.status === 'disbursed';
  const canDelete = voucher.status === 'draft';

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/treasury/petty-cash')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <FileTextIcon className="h-8 w-8" />
              {voucher.voucher_number}
            </h1>
            <p className="text-gray-600 mt-1">Petty Cash Voucher Details</p>
          </div>
        </div>
        <div className={`px-4 py-2 rounded-lg ${statusInfo.color} flex items-center gap-2`}>
          <StatusIcon className="h-5 w-5" />
          <span className="font-semibold">{statusInfo.label}</span>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="h-5 w-5 text-red-600 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Voucher Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Voucher Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Voucher Number</p>
                <p className="font-medium">{voucher.voucher_number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fund</p>
                <button
                  onClick={() => navigate(`/treasury/petty-cash/funds/${voucher.fund}`)}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {voucher.fund_name}
                </button>
              </div>
              <div>
                <p className="text-sm text-gray-600">Amount</p>
                <p className="text-2xl font-bold text-green-600">
                  ${parseFloat(voucher.amount).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Request Date</p>
                <p className="font-medium">
                  {format(new Date(voucher.voucher_date), 'MMM dd, yyyy')}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Payee</p>
                <p className="font-medium">{voucher.payee_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Expense Category</p>
                <p className="font-medium">
                  {voucher.expense_category_name || `Category #${voucher.expense_category}`}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-600 mb-2">Description</p>
              <p className="text-gray-900">{voucher.purpose}</p>
            </div>
          </div>

          {/* Workflow History */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Workflow History</h2>
            <div className="space-y-4">
              {/* Requested */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="p-2 bg-blue-100 rounded-full">
                    <UserIcon className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                </div>
                <div className="flex-1 pb-4">
                  <p className="font-medium">Requested</p>
                  <p className="text-sm text-gray-600">
                    By {voucher.requested_by_name} on{' '}
                    {format(new Date(voucher.voucher_date), 'MMM dd, yyyy HH:mm')}
                  </p>
                </div>
              </div>

              {/* Approved */}
              {voucher.status !== 'draft' &&
                voucher.status !== 'pending' &&
                voucher.approved_at && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="p-2 bg-green-100 rounded-full">
                        <CheckCircle2Icon className="h-4 w-4 text-green-600" />
                      </div>
                      {(voucher.status === 'disbursed' || voucher.status === 'retired') && (
                        <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="font-medium">Approved</p>
                      <p className="text-sm text-gray-600">
                        By {voucher.approved_by_name} on{' '}
                        {format(new Date(voucher.approved_at), 'MMM dd, yyyy HH:mm')}
                      </p>
                      {voucher.approval_notes && (
                        <p className="text-sm text-gray-700 mt-1 italic">
                          "{voucher.approval_notes}"
                        </p>
                      )}
                    </div>
                  </div>
                )}

              {/* Rejected */}
              {voucher.status === 'rejected' && voucher.approved_at && (
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="p-2 bg-red-100 rounded-full">
                      <XCircleIcon className="h-4 w-4 text-red-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Rejected</p>
                    <p className="text-sm text-gray-600">
                      By {voucher.approved_by_name} on{' '}
                      {format(new Date(voucher.approved_at), 'MMM dd, yyyy HH:mm')}
                    </p>
                    {voucher.approval_notes && (
                      <p className="text-sm text-gray-700 mt-1 italic">
                        "{voucher.approval_notes}"
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Disbursed */}
              {(voucher.status === 'disbursed' || voucher.status === 'retired') &&
                voucher.disbursed_at && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="p-2 bg-blue-100 rounded-full">
                        <BanknoteIcon className="h-4 w-4 text-blue-600" />
                      </div>
                      {voucher.status === 'retired' && (
                        <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="font-medium">Cash Disbursed</p>
                      <p className="text-sm text-gray-600">
                        By {voucher.disbursed_by_name} on{' '}
                        {format(new Date(voucher.disbursed_at), 'MMM dd, yyyy HH:mm')}
                      </p>
                      {voucher.notes && (
                        <p className="text-sm text-gray-700 mt-1 italic">"{voucher.notes}"</p>
                      )}
                    </div>
                  </div>
                )}

              {/* Retired */}
              {voucher.status === 'retired' && voucher.retired_at && (
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="p-2 bg-purple-100 rounded-full">
                      <ReceiptIcon className="h-4 w-4 text-purple-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Receipts Submitted</p>
                    <p className="text-sm text-gray-600">
                      On {format(new Date(voucher.retired_at), 'MMM dd, yyyy HH:mm')}
                    </p>
                    {voucher.notes && (
                      <p className="text-sm text-gray-700 mt-1 italic">"{voucher.notes}"</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Receipts Section */}
          {(voucher.status === 'disbursed' || voucher.status === 'retired') && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ReceiptIcon className="h-5 w-5" />
                Supporting Receipts
              </h2>
              <PettyCashReceiptUpload
                voucherId={voucher.id}
                canUpload={voucher.status === 'disbursed'}
              />
            </div>
          )}
        </div>

        {/* Actions Panel */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Actions</h2>
            <div className="space-y-3">
              {canEdit && (
                <button
                  onClick={() => navigate(`/treasury/petty-cash/vouchers/${voucherId}/edit`)}
                  className="w-full px-4 py-2 border border- rounded-lg hover:bg-gray-50 flex items-center gap-2 justify-center"
                >
                  <EditIcon className="h-4 w-4" />
                  Edit Voucher
                </button>
              )}

              {canSubmit && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 justify-center disabled:opacity-50"
                >
                  <SendIcon className="h-4 w-4" />
                  Submit for Approval
                </button>
              )}

              {canApprove && (
                <button
                  onClick={() => setActionDialog({ visible: true, type: 'approve' })}
                  disabled={submitting}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 justify-center disabled:opacity-50"
                >
                  <CheckCircle2Icon className="h-4 w-4" />
                  Approve Voucher
                </button>
              )}

              {canReject && (
                <button
                  onClick={() => setActionDialog({ visible: true, type: 'reject' })}
                  disabled={submitting}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 justify-center disabled:opacity-50"
                >
                  <XCircleIcon className="h-4 w-4" />
                  Reject Voucher
                </button>
              )}

              {canDisburse && (
                <button
                  onClick={() => setActionDialog({ visible: true, type: 'disburse' })}
                  disabled={submitting}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 justify-center disabled:opacity-50"
                >
                  <BanknoteIcon className="h-4 w-4" />
                  Disburse Cash
                </button>
              )}

              {canRetire && (
                <button
                  onClick={() => setActionDialog({ visible: true, type: 'retire' })}
                  disabled={submitting}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 justify-center disabled:opacity-50"
                >
                  <ReceiptIcon className="h-4 w-4" />
                  Retire with Receipts
                </button>
              )}

              {canDelete && (
                <button
                  onClick={handleDelete}
                  disabled={submitting}
                  className="w-full px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-2 justify-center disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete Voucher
                </button>
              )}
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Workflow Status</h3>
            <p className="text-sm text-blue-700">
              {voucher.status === 'draft' &&
                'This voucher is in draft mode. Submit it for approval to proceed.'}
              {voucher.status === 'pending' &&
                'This voucher is awaiting approval from an authorized person.'}
              {voucher.status === 'approved' &&
                'This voucher has been approved. Cash can now be disbursed.'}
              {voucher.status === 'rejected' &&
                'This voucher has been rejected and cannot proceed further.'}
              {voucher.status === 'disbursed' &&
                'Cash has been disbursed. Waiting for receipts to be submitted.'}
              {voucher.status === 'retired' &&
                'Receipts have been submitted. This voucher can be included in reimbursement.'}
            </p>
          </div>
        </div>
      </div>

      {/* Action Dialog */}
      {actionDialog.visible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {actionDialog.type === 'approve' && 'Approve Voucher'}
              {actionDialog.type === 'reject' && 'Reject Voucher'}
              {actionDialog.type === 'disburse' && 'Disburse Cash'}
              {actionDialog.type === 'retire' && 'Retire with Receipts'}
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Comments {actionDialog.type === 'reject' ? '(Required)' : '(Optional)'}
              </label>
              <textarea
                value={actionComments}
                onChange={e => setActionComments(e.target.value)}
                rows={4}
                placeholder="Add any relevant comments..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setActionDialog({ visible: false, type: null });
                  setActionComments('');
                }}
                disabled={submitting}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={submitting || (actionDialog.type === 'reject' && !actionComments.trim())}
                className={`px-4 py-2 rounded-lg text-white disabled:opacity-50 ${
                  actionDialog.type === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : actionDialog.type === 'reject'
                      ? 'bg-red-600 hover:bg-red-700'
                      : actionDialog.type === 'disburse'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                {submitting ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
