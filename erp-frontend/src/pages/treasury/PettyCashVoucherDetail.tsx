/**
 * Petty Cash Voucher Detail Page
 * View voucher details and perform workflow actions
 */

import React, { useEffect, useState } from 'react';
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
  UndoIcon,
  Building2Icon,
} from 'lucide-react';
import {
  usePettyCashVoucher,
  useSubmitVoucher,
  useApproveVoucher,
  useRejectVoucher,
  useDisburseVoucher,
  useRetireVoucher,
  useRequestVoucherReversal,
  useApproveVoucherReversal,
  useRejectVoucherReversal,
  useDeletePettyCashVoucher,
} from '../../hooks/usePettyCash';
import PettyCashReceiptUpload from '../../components/treasury/PettyCashReceiptUpload';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import { useAuth } from '../../hooks/useAuth';
import { bankService } from '../../services/bankService';
import type { BankAccount } from '../../types/banks';

const STATUS_INFO = {
  draft: { color: 'bg-gray-100 text-gray-800', icon: ClockIcon, label: 'Draft' },
  pending: { color: 'bg-yellow-100 text-yellow-800', icon: ClockIcon, label: 'Pending Approval' },
  approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle2Icon, label: 'Approved' },
  rejected: { color: 'bg-red-100 text-red-800', icon: XCircleIcon, label: 'Rejected' },
  disbursed: { color: 'bg-blue-100 text-blue-800', icon: BanknoteIcon, label: 'Disbursed' },
  retired: { color: 'bg-purple-100 text-purple-800', icon: CheckCircle2Icon, label: 'Retired' },
  reversal_pending: {
    color: 'bg-amber-100 text-amber-800',
    icon: ClockIcon,
    label: 'Reversal Pending Approval',
  },
  cancelled: { color: 'bg-gray-100 text-gray-600', icon: XCircleIcon, label: 'Cancelled' },
};

export const PettyCashVoucherDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const voucherId = parseInt(id || '0');

  const [actionDialog, setActionDialog] = useState<{
    visible: boolean;
    type:
      | 'approve'
      | 'reject'
      | 'disburse'
      | 'retire'
      | 'request_reversal'
      | 'approve_reversal'
      | 'reject_reversal'
      | null;
  }>({ visible: false, type: null });
  const [actionComments, setActionComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState<number | ''>('');

  // Fetch voucher data
  const { data: voucher, isLoading } = usePettyCashVoucher(voucherId);
  const { canUserApprove } = useApprovalGuard();
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id != null ? Number(currentUser.id) : null;

  useEffect(() => {
    if (voucher?.fund_disbursement_mode === 'bank_transfer') {
      bankService.listBankAccounts({ is_active: true }).then(setBankAccounts).catch(() => {});
    }
  }, [voucher?.fund_disbursement_mode]);

  // Mutations
  const submitMutation = useSubmitVoucher();
  const approveMutation = useApproveVoucher();
  const rejectMutation = useRejectVoucher();
  const disburseMutation = useDisburseVoucher();
  const retireMutation = useRetireVoucher();
  const requestReversalMutation = useRequestVoucherReversal();
  const approveReversalMutation = useApproveVoucherReversal();
  const rejectReversalMutation = useRejectVoucherReversal();
  const deleteMutation = useDeletePettyCashVoucher();

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await submitMutation.mutateAsync(voucherId);
      navigate('/treasury/petty-cash');
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          err.response?.data?.message ||
          'Failed to submit voucher'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async () => {
    if (!actionDialog.type) return;

    setSubmitting(true);
    setError('');
    try {
      // reject/request_reversal/reject_reversal are validated server-side
      // against `reason`, not `notes`
      const reasonBased = ['reject', 'request_reversal', 'reject_reversal'];
      const data = reasonBased.includes(actionDialog.type)
        ? { reason: actionComments }
        : { notes: actionComments };

      switch (actionDialog.type) {
        case 'approve':
          await approveMutation.mutateAsync({ id: voucherId, data });
          break;
        case 'reject':
          await rejectMutation.mutateAsync({ id: voucherId, data });
          break;
        case 'disburse':
          await disburseMutation.mutateAsync({
            id: voucherId,
            data:
              voucher?.fund_disbursement_mode === 'bank_transfer'
                ? { ...data, bank_account: selectedBankAccount || null }
                : data,
          });
          break;
        case 'retire':
          await retireMutation.mutateAsync({ id: voucherId, data });
          break;
        case 'request_reversal':
          await requestReversalMutation.mutateAsync({ id: voucherId, data });
          break;
        case 'approve_reversal':
          await approveReversalMutation.mutateAsync(voucherId);
          break;
        case 'reject_reversal':
          await rejectReversalMutation.mutateAsync({ id: voucherId, data });
          break;
      }

      setActionDialog({ visible: false, type: null });
      setActionComments('');
      setSelectedBankAccount('');
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          err.response?.data?.message ||
          `Failed to ${actionDialog.type} voucher`
      );
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
  const isBankTransferVoucher = voucher.fund_disbursement_mode === 'bank_transfer';
  // Maker-checker for bank-transfer disbursement: the requester and approver
  // can't also be the one who executes the transfer. The backend enforces
  // this for real — this just hides the button rather than surfacing a 400.
  const isMakerOrChecker =
    voucher.requested_by === currentUserId || voucher.approved_by === currentUserId;
  const canDisburse =
    canUserApprove &&
    voucher.status === 'approved' &&
    (!isBankTransferVoucher || !isMakerOrChecker);
  const canRetire = voucher.status === 'disbursed';
  // Maker step: stage a reversal request. Anyone who could disburse can request one.
  const canRequestReversal =
    canUserApprove &&
    (voucher.status === 'disbursed' || voucher.status === 'retired') &&
    !voucher.replenishment;
  // Checker step: a *different* authorised user approves/rejects. The backend
  // enforces the different-user rule; the frontend just hides the obvious case.
  const canActOnReversal =
    canUserApprove &&
    voucher.status === 'reversal_pending' &&
    voucher.reversal_requested_by !== currentUserId;
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
                <p className="font-medium">
                  {voucher.payee_name}
                  {voucher.payee_staff_name && (
                    <span className="text-gray-500 font-normal"> ({voucher.payee_staff_name})</span>
                  )}
                </p>
              </div>
              {isBankTransferVoucher &&
                (voucher.payee_display_bank_name || voucher.payee_display_bank_account_number) && (
                  <div>
                    <p className="text-sm text-gray-600">Payee Bank Details</p>
                    <p className="font-medium">
                      {voucher.payee_display_bank_name || '—'}
                      {voucher.payee_display_bank_account_number
                        ? ` — ${voucher.payee_display_bank_account_number}`
                        : ''}
                    </p>
                    {voucher.payee_display_bank_account_name && (
                      <p className="text-xs text-gray-500">
                        {voucher.payee_display_bank_account_name}
                      </p>
                    )}
                  </div>
                )}
              {(!voucher.lines || voucher.lines.length === 0) && (
                <div>
                  <p className="text-sm text-gray-600">Expense Category</p>
                  <p className="font-medium">
                    {voucher.expense_category_name || `Category #${voucher.expense_category}`}
                  </p>
                </div>
              )}
            </div>

            {voucher.lines && voucher.lines.length > 0 ? (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-gray-600 mb-2">Expense Line Items</p>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-1.5 pr-3 font-medium">Category</th>
                      <th className="py-1.5 pr-3 font-medium">Description</th>
                      <th className="py-1.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voucher.lines.map(line => (
                      <tr key={line.id} className="border-t border-gray-100">
                        <td className="py-1.5 pr-3">{line.expense_category_name ?? `Category #${line.expense_category}`}</td>
                        <td className="py-1.5 pr-3 text-gray-700">{line.description}</td>
                        <td className="py-1.5 text-right font-medium">
                          ${parseFloat(line.amount).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-gray-600 mb-2">Description</p>
                <p className="text-gray-900">{voucher.purpose}</p>
              </div>
            )}
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
                      <p className="font-medium">
                        {voucher.disbursement_account
                          ? 'Bank Transfer Executed'
                          : 'Cash Disbursed'}
                      </p>
                      <p className="text-sm text-gray-600">
                        By {voucher.disbursed_by_name} on{' '}
                        {format(new Date(voucher.disbursed_at), 'MMM dd, yyyy HH:mm')}
                      </p>
                      {voucher.disbursement_account && (
                        <p className="text-sm text-gray-700 mt-1">
                          Via {voucher.disbursement_bank_name || 'bank'}
                          {voucher.disbursement_account_number
                            ? ` — ${voucher.disbursement_account_number}`
                            : ''}
                          {voucher.disbursement_account_name
                            ? ` (${voucher.disbursement_account_name})`
                            : ''}
                        </p>
                      )}
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
                  {isBankTransferVoucher ? (
                    <Building2Icon className="h-4 w-4" />
                  ) : (
                    <BanknoteIcon className="h-4 w-4" />
                  )}
                  {isBankTransferVoucher ? 'Disburse via Bank Transfer' : 'Disburse Cash'}
                </button>
              )}

              {isBankTransferVoucher && voucher.status === 'approved' && isMakerOrChecker && (
                <p className="text-xs text-gray-500 text-center px-2">
                  You requested or approved this voucher — a different authorised person must
                  execute the bank transfer (maker-checker).
                </p>
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

              {canRequestReversal && (
                <button
                  onClick={() => setActionDialog({ visible: true, type: 'request_reversal' })}
                  disabled={submitting}
                  className="w-full px-4 py-2 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 flex items-center gap-2 justify-center disabled:opacity-50"
                >
                  <UndoIcon className="h-4 w-4" />
                  Request Reversal
                </button>
              )}

              {voucher.status === 'reversal_pending' && !canActOnReversal && (
                <p className="text-xs text-gray-500 text-center px-2">
                  Reversal requested by {voucher.reversal_requested_by_name ?? 'another user'} —
                  a different authorised user must approve or reject it.
                </p>
              )}

              {canActOnReversal && (
                <>
                  <button
                    onClick={() => setActionDialog({ visible: true, type: 'approve_reversal' })}
                    disabled={submitting}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 justify-center disabled:opacity-50"
                  >
                    <UndoIcon className="h-4 w-4" />
                    Approve Reversal
                  </button>
                  <button
                    onClick={() => setActionDialog({ visible: true, type: 'reject_reversal' })}
                    disabled={submitting}
                    className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2 justify-center disabled:opacity-50"
                  >
                    <XCircleIcon className="h-4 w-4" />
                    Reject Reversal
                  </button>
                </>
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
                (isBankTransferVoucher
                  ? 'This voucher has been approved. A different, authorised person (not the requester or approver) can now execute the bank transfer.'
                  : 'This voucher has been approved. Cash can now be disbursed.')}
              {voucher.status === 'rejected' &&
                'This voucher has been rejected and cannot proceed further.'}
              {voucher.status === 'disbursed' &&
                (isBankTransferVoucher
                  ? 'The bank transfer has been executed. Waiting for receipts to be submitted.'
                  : 'Cash has been disbursed. Waiting for receipts to be submitted.')}
              {voucher.status === 'retired' &&
                'Receipts have been submitted. This voucher can be included in reimbursement.'}
              {voucher.status === 'reversal_pending' &&
                'A reversal has been requested and is awaiting approval from a different authorised user.'}
              {voucher.status === 'cancelled' &&
                voucher.reversed_at &&
                'This disbursement has been reversed and the amount restored to the fund.'}
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
              {actionDialog.type === 'disburse' &&
                (isBankTransferVoucher ? 'Disburse via Bank Transfer' : 'Disburse Cash')}
              {actionDialog.type === 'retire' && 'Retire with Receipts'}
              {actionDialog.type === 'request_reversal' && 'Request Reversal'}
              {actionDialog.type === 'approve_reversal' && 'Approve Reversal'}
              {actionDialog.type === 'reject_reversal' && 'Reject Reversal'}
            </h3>
            {actionDialog.type === 'request_reversal' && (
              <p className="text-sm text-gray-600 mb-4">
                This stages a reversal request — nothing changes yet. A different authorised user
                must approve it before the GL entry is reversed and the fund's cash balance
                restored.
              </p>
            )}
            {actionDialog.type === 'approve_reversal' && (
              <p className="text-sm text-gray-600 mb-4">
                Reason for this request: "{voucher.reversal_reason}"
                <br />
                Approving posts an offsetting GL entry, restores the amount to the fund's cash
                balance, and cancels this voucher. It cannot be undone.
              </p>
            )}
            {actionDialog.type === 'disburse' && isBankTransferVoucher && (
              <div className="mb-4 space-y-3">
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Payee Bank Details
                  </p>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Payee:</span>
                    <span className="font-medium text-gray-900">{voucher.payee_name}</span>
                  </div>
                  {voucher.payee_display_bank_account_number ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Account:</span>
                        <span className="font-mono font-bold text-gray-900 tracking-wider">
                          {voucher.payee_display_bank_account_number}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Bank:</span>
                        <span className="font-medium text-gray-900">
                          {voucher.payee_display_bank_name || '—'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-amber-700 text-xs">
                      No bank details on file for this payee — confirm them before transferring.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Disbursement Account (source) <span className="text-red-500">*</span>
                  </label>
                  <select
                    title="Disbursement account"
                    value={selectedBankAccount}
                    onChange={e =>
                      setSelectedBankAccount(e.target.value ? Number(e.target.value) : '')
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select bank account —</option>
                    {bankAccounts.map(ba => (
                      <option key={ba.id} value={ba.id}>
                        {ba.bank_display_name || ba.bank_name} — {ba.account_number} (
                        {ba.account_name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {(actionDialog.type === 'request_reversal' ||
              actionDialog.type === 'reject_reversal') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason (Required)
                </label>
                <textarea
                  value={actionComments}
                  onChange={e => setActionComments(e.target.value)}
                  rows={4}
                  placeholder="Add any relevant comments..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            {actionDialog.type !== 'approve_reversal' &&
              actionDialog.type !== 'request_reversal' &&
              actionDialog.type !== 'reject_reversal' && (
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
              )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setActionDialog({ visible: false, type: null });
                  setActionComments('');
                  setSelectedBankAccount('');
                }}
                disabled={submitting}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={
                  submitting ||
                  (['reject', 'request_reversal', 'reject_reversal'].includes(
                    actionDialog.type ?? ''
                  ) &&
                    !actionComments.trim()) ||
                  (actionDialog.type === 'disburse' &&
                    isBankTransferVoucher &&
                    !selectedBankAccount)
                }
                className={`px-4 py-2 rounded-lg text-white disabled:opacity-50 ${
                  actionDialog.type === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : actionDialog.type === 'reject' || actionDialog.type === 'approve_reversal'
                      ? 'bg-red-600 hover:bg-red-700'
                      : actionDialog.type === 'disburse'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : actionDialog.type === 'request_reversal' ||
                            actionDialog.type === 'reject_reversal'
                          ? 'bg-amber-600 hover:bg-amber-700'
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
