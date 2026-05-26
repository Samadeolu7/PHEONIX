/**
 * Petty Cash Replenishment Detail Page
 * View replenishment details and perform workflow actions (verify, approve, post)
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  RefreshCwIcon,
  ArrowLeftIcon,
  EditIcon,
  CheckCircle2Icon,
  XCircleIcon,
  FileCheckIcon,
  DollarSignIcon,
  AlertCircleIcon,
  ClockIcon,
  UserIcon,
  FileTextIcon,
} from 'lucide-react';
import {
  usePettyCashReplenishment,
  useVerifyReplenishment,
  useApproveReplenishment,
  useRejectReplenishment,
  usePostReplenishment,
} from '../../hooks/usePettyCash';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';

const STATUS_INFO = {
  draft: { color: 'bg-gray-100 text-gray-800', icon: ClockIcon, label: 'Draft' },
  submitted: {
    color: 'bg-yellow-100 text-yellow-800',
    icon: ClockIcon,
    label: 'Submitted – Awaiting Verification',
  },
  under_review: { color: 'bg-blue-100 text-blue-800', icon: FileCheckIcon, label: 'Under Review' },
  approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle2Icon, label: 'Approved' },
  rejected: { color: 'bg-red-100 text-red-800', icon: XCircleIcon, label: 'Rejected' },
  posted: { color: 'bg-purple-100 text-purple-800', icon: CheckCircle2Icon, label: 'Posted to GL' },
};

export const PettyCashReplenishmentDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const replenishmentId = parseInt(id || '0');

  const [actionDialog, setActionDialog] = useState<{
    visible: boolean;
    type: 'verify' | 'approve' | 'reject' | null;
  }>({ visible: false, type: null });
  const [actionComments, setActionComments] = useState('');
  const [approvedAmountInput, setApprovedAmountInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch data
  const { data: replenishment, isLoading } = usePettyCashReplenishment(replenishmentId);
  const { canUserApprove } = useApprovalGuard();

  // Mutations
  const verifyMutation = useVerifyReplenishment();
  const approveMutation = useApproveReplenishment();
  const rejectMutation = useRejectReplenishment();
  const postMutation = usePostReplenishment();

  const handleAction = async () => {
    if (!actionDialog.type) return;

    setSubmitting(true);
    setError('');
    try {
      switch (actionDialog.type) {
        case 'verify':
          await verifyMutation.mutateAsync({
            id: replenishmentId,
            data: { notes: actionComments },
          });
          break;
        case 'approve': {
          const approveData: { notes: string; approved_amount?: string } = {
            notes: actionComments,
          };
          if (approvedAmountInput) approveData.approved_amount = approvedAmountInput;
          await approveMutation.mutateAsync({ id: replenishmentId, data: approveData });
          break;
        }
        case 'reject':
          await rejectMutation.mutateAsync({
            id: replenishmentId,
            data: { reason: actionComments },
          });
          break;
      }

      setActionDialog({ visible: false, type: null });
      setActionComments('');
      setApprovedAmountInput('');
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          `Failed to ${actionDialog.type} reimbursement`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePost = async () => {
    if (
      !confirm(
        'Are you sure you want to post this reimbursement? This will create a journal entry and cannot be undone.'
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await postMutation.mutateAsync(replenishmentId);
      // Stay on page to show posted status
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to post reimbursement');
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

  if (!replenishment) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="font-semibold text-red-900">Reimbursement Not Found</h3>
          <p className="text-sm text-red-700 mt-1">
            The reimbursement you're looking for doesn't exist.
          </p>
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

  const statusInfo =
    STATUS_INFO[replenishment.status as keyof typeof STATUS_INFO] ?? STATUS_INFO.draft;
  const StatusIcon = statusInfo.icon;

  // Determine available actions based on status
  const canEdit = ['draft', 'submitted'].includes(replenishment.status);
  const canVerify = replenishment.status === 'submitted'; // finance officer verifies receipts
  const canApprove = canUserApprove && replenishment.status === 'under_review'; // manager approves
  const canReject = canUserApprove && ['submitted', 'under_review'].includes(replenishment.status);
  const canPost = canUserApprove && replenishment.status === 'approved';

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            title="Back to petty cash dashboard"
            onClick={() => navigate('/treasury/petty-cash')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <RefreshCwIcon className="h-8 w-8" />
              {replenishment.replenishment_number}
            </h1>
            <p className="text-gray-600 mt-1">Petty Cash Reimbursement Details</p>
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
        {/* Reimbursement Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Reimbursement Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Reimbursement Number</p>
                <p className="font-medium">{replenishment.replenishment_number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fund</p>
                <button
                  title="View fund"
                  onClick={() => navigate(`/treasury/petty-cash/funds/${replenishment.fund}`)}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {replenishment.fund_name}
                </button>
              </div>
              <div>
                <p className="text-sm text-gray-600">Requested Amount</p>
                <p className="text-2xl font-bold text-blue-600">
                  ₦
                  {parseFloat(
                    replenishment.requested_amount ?? replenishment.replenishment_amount
                  ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              {replenishment.approved_amount && (
                <div>
                  <p className="text-sm text-gray-600">Approved Amount</p>
                  <p className="text-2xl font-bold text-green-600">
                    ₦
                    {parseFloat(replenishment.approved_amount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-600">Vouchers Total</p>
                <p className="font-medium">
                  ₦
                  {parseFloat(replenishment.replenishment_amount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Request Date</p>
                <p className="font-medium">
                  {format(new Date(replenishment.replenishment_date), 'MMM dd, yyyy')}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Number of Vouchers</p>
                <p className="font-medium">{replenishment.vouchers_count ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Source Bank Account</p>
                <p className="font-medium">{replenishment.bank_account_name_display ?? '—'}</p>
              </div>
              {replenishment.journal_entry && (
                <div>
                  <p className="text-sm text-gray-600">Journal Entry</p>
                  <p className="font-medium">#{replenishment.journal_entry}</p>
                </div>
              )}
            </div>
          </div>

          {/* Vouchers Included */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">
              Included Vouchers ({replenishment.vouchers_count})
            </h2>
            {replenishment.vouchers && replenishment.vouchers.length > 0 ? (
              <div className="border rounded-lg divide-y">
                {replenishment.vouchers.map(voucherId => (
                  <div key={voucherId} className="p-3 hover:bg-gray-50">
                    <button
                      title={`View voucher ${voucherId}`}
                      onClick={() => navigate(`/treasury/petty-cash/vouchers/${voucherId}`)}
                      className="w-full text-left flex justify-between items-center"
                    >
                      <span className="text-blue-600 font-medium">View Voucher #{voucherId}</span>
                      <FileTextIcon className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No vouchers included</p>
            )}
          </div>

          {/* Expense Breakdown */}
          {Object.keys(replenishment.expense_breakdown ?? {}).length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Expense Breakdown by Category</h2>
              <div className="border rounded-lg divide-y">
                {Object.entries(replenishment.expense_breakdown).map(([category, data]) => (
                  <div key={category} className="p-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium">{category}</p>
                      <p className="text-xs text-gray-500">{data.vouchers?.join(', ')}</p>
                    </div>
                    <p className="font-semibold">
                      ₦{Number(data.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Workflow History */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Workflow History</h2>
            <div className="space-y-4">
              {/* Submitted */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="p-2 bg-blue-100 rounded-full">
                    <UserIcon className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                </div>
                <div className="flex-1 pb-4">
                  <p className="font-medium">Submitted by {replenishment.submitted_by_name}</p>
                  <p className="text-sm text-gray-600">
                    On{' '}
                    {format(
                      new Date(replenishment.submitted_at ?? replenishment.replenishment_date),
                      'MMM dd, yyyy HH:mm'
                    )}
                  </p>
                </div>
              </div>

              {/* Verified */}
              {replenishment.verified_at && replenishment.verified_by_name && (
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="p-2 bg-blue-100 rounded-full">
                      <FileCheckIcon className="h-4 w-4 text-blue-600" />
                    </div>
                    {['approved', 'posted'].includes(replenishment.status) && (
                      <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="font-medium">Verified by {replenishment.verified_by_name}</p>
                    <p className="text-sm text-gray-600">
                      On {format(new Date(replenishment.verified_at), 'MMM dd, yyyy HH:mm')}
                    </p>
                    {replenishment.verification_notes && (
                      <p className="text-sm text-gray-700 mt-1 italic">
                        "{replenishment.verification_notes}"
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Rejected */}
              {replenishment.status === 'rejected' && replenishment.rejected_at && (
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="p-2 bg-red-100 rounded-full">
                      <XCircleIcon className="h-4 w-4 text-red-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Rejected by {replenishment.rejected_by_name}</p>
                    <p className="text-sm text-gray-600">
                      On {format(new Date(replenishment.rejected_at), 'MMM dd, yyyy HH:mm')}
                    </p>
                    {replenishment.rejection_reason && (
                      <p className="text-sm text-gray-700 mt-1 italic">
                        "{replenishment.rejection_reason}"
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Approved */}
              {['approved', 'posted'].includes(replenishment.status) &&
                replenishment.approved_at && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="p-2 bg-green-100 rounded-full">
                        <CheckCircle2Icon className="h-4 w-4 text-green-600" />
                      </div>
                      {replenishment.status === 'posted' && (
                        <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="font-medium">Approved by {replenishment.approved_by_name}</p>
                      <p className="text-sm text-gray-600">
                        On {format(new Date(replenishment.approved_at), 'MMM dd, yyyy HH:mm')}
                      </p>
                      {replenishment.approved_amount && (
                        <p className="text-sm text-green-700 mt-1 font-medium">
                          Approved amount: ₦
                          {parseFloat(replenishment.approved_amount).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      )}
                      {replenishment.approval_notes && (
                        <p className="text-sm text-gray-700 mt-1 italic">
                          "{replenishment.approval_notes}"
                        </p>
                      )}
                    </div>
                  </div>
                )}

              {/* Posted */}
              {replenishment.status === 'posted' && replenishment.posted_at && (
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="p-2 bg-purple-100 rounded-full">
                      <DollarSignIcon className="h-4 w-4 text-purple-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Posted to GL by {replenishment.posted_by_name}</p>
                    <p className="text-sm text-gray-600">
                      On {format(new Date(replenishment.posted_at), 'MMM dd, yyyy HH:mm')}
                    </p>
                    {replenishment.journal_entry && (
                      <p className="text-sm text-gray-600 mt-1">
                        Journal Entry: #{replenishment.journal_entry}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions Panel */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Actions</h2>
            <div className="space-y-3">
              {canEdit && (
                <button
                  onClick={() =>
                    navigate(`/treasury/petty-cash/replenishments/${replenishmentId}/edit`)
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 justify-center"
                >
                  <EditIcon className="h-4 w-4" />
                  Edit Reimbursement
                </button>
              )}

              {canVerify && (
                <button
                  onClick={() => setActionDialog({ visible: true, type: 'verify' })}
                  disabled={submitting}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 justify-center disabled:opacity-50"
                >
                  <FileCheckIcon className="h-4 w-4" />
                  Verify Receipts
                </button>
              )}

              {canApprove && (
                <button
                  onClick={() => setActionDialog({ visible: true, type: 'approve' })}
                  disabled={submitting}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 justify-center disabled:opacity-50"
                >
                  <CheckCircle2Icon className="h-4 w-4" />
                  Approve Reimbursement
                </button>
              )}

              {canReject && (
                <button
                  onClick={() => setActionDialog({ visible: true, type: 'reject' })}
                  disabled={submitting}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 justify-center disabled:opacity-50"
                >
                  <XCircleIcon className="h-4 w-4" />
                  Reject Reimbursement
                </button>
              )}

              {canPost && (
                <button
                  onClick={handlePost}
                  disabled={submitting}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 justify-center disabled:opacity-50"
                >
                  <DollarSignIcon className="h-4 w-4" />
                  Post to GL
                </button>
              )}
            </div>
          </div>

          {/* Accounting Info */}
          {replenishment.status === 'posted' && replenishment.journal_entry && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="font-semibold text-purple-900 mb-2">Journal Entry</h3>
              <p className="text-sm text-purple-700">
                This reimbursement has been posted to the general ledger.
              </p>
              <p className="text-sm text-purple-900 font-medium mt-2">
                Entry: #{replenishment.journal_entry}
              </p>
              <button
                title="View journal entry"
                onClick={() => navigate(`/accounting/transactions/${replenishment.journal_entry}`)}
                className="mt-3 text-sm text-purple-600 hover:underline"
              >
                View Journal Entry →
              </button>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Workflow Status</h3>
            <p className="text-sm text-blue-700">
              {replenishment.status === 'draft' &&
                'This reimbursement is in draft mode. Submit it for verification to proceed.'}
              {replenishment.status === 'submitted' &&
                'Awaiting verification of receipts by accounting officer.'}
              {replenishment.status === 'under_review' &&
                'Receipts verified. Awaiting approval from authorized person.'}
              {replenishment.status === 'approved' &&
                'Approved and ready to post. Posting will create a GL entry and restore the fund balance.'}
              {replenishment.status === 'rejected' &&
                'This reimbursement has been rejected and cannot proceed further.'}
              {replenishment.status === 'posted' &&
                'Posted to general ledger. Fund balance has been restored.'}
            </p>
          </div>

          {/* Accounting Preview */}
          {replenishment.status === 'approved' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">Posting Preview</h3>
              <p className="text-sm text-green-700 mb-3">
                The following journal entry will be created:
              </p>
              <div className="text-xs font-mono bg-white border rounded p-2 space-y-1">
                <div>
                  Dr. Petty Cash Account ... ₦
                  {parseFloat(
                    replenishment.approved_amount ??
                      replenishment.requested_amount ??
                      replenishment.replenishment_amount
                  ).toFixed(2)}
                </div>
                <div className="pl-4">
                  Cr. Bank/Cash Account ... ₦
                  {parseFloat(
                    replenishment.approved_amount ??
                      replenishment.requested_amount ??
                      replenishment.replenishment_amount
                  ).toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Dialog */}
      {actionDialog.visible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {actionDialog.type === 'verify' && 'Verify Receipts'}
              {actionDialog.type === 'approve' && 'Approve Reimbursement'}
              {actionDialog.type === 'reject' && 'Reject Reimbursement'}
            </h3>

            {/* Approved amount — only shown during approve action */}
            {actionDialog.type === 'approve' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Approved Amount (Optional)
                </label>
                <p className="text-xs text-gray-500 mb-1">
                  Leave blank to approve the full requested amount of{' '}
                  <strong>
                    ₦
                    {parseFloat(
                      replenishment.requested_amount ?? replenishment.replenishment_amount
                    ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </strong>
                  . Enter a lower value to partially approve.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">₦</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={approvedAmountInput}
                    onChange={e => setApprovedAmountInput(e.target.value)}
                    placeholder={parseFloat(
                      replenishment.requested_amount ?? replenishment.replenishment_amount
                    ).toFixed(2)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {actionDialog.type === 'reject'
                  ? 'Rejection Reason (Required)'
                  : 'Comments (Optional)'}
              </label>
              <textarea
                value={actionComments}
                onChange={e => setActionComments(e.target.value)}
                rows={4}
                placeholder={
                  actionDialog.type === 'reject'
                    ? 'State the reason for rejection...'
                    : 'Add any relevant comments...'
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
            <div className="flex justify-end gap-3">
              <button
                title="Cancel"
                onClick={() => {
                  setActionDialog({ visible: false, type: null });
                  setActionComments('');
                  setApprovedAmountInput('');
                  setError('');
                }}
                disabled={submitting}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                title="Confirm action"
                onClick={handleAction}
                disabled={submitting || (actionDialog.type === 'reject' && !actionComments.trim())}
                className={`px-4 py-2 rounded-lg text-white disabled:opacity-50 ${
                  actionDialog.type === 'verify'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : actionDialog.type === 'approve'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
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
