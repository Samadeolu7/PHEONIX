import React, { useState } from 'react';
import type { ComponentType } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  BookOpen,
  User,
  Building,
  Calendar,
  FileText,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import {
  useOfficeUseRequest,
  useSubmitOfficeUseRequest,
  useApproveOfficeUseRequest,
  useRejectOfficeUseRequest,
  useFulfillOfficeUseRequest,
  useCancelOfficeUseRequest,
  useCheckOfficeUseRequestStock,
} from '../../hooks/useLedger';
import { OfficeUseRequestStatus } from '../../types/ledger';

// ── Status badge ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  OfficeUseRequestStatus,
  { label: string; bg: string; text: string; Icon: ComponentType<{ className?: string }> }
> = {
  draft: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-700', Icon: FileText },
  submitted: {
    label: 'Pending Approval',
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    Icon: Clock,
  },
  approved: { label: 'Approved', bg: 'bg-blue-100', text: 'text-blue-800', Icon: CheckCircle },
  rejected: { label: 'Rejected', bg: 'bg-red-100', text: 'text-red-800', Icon: XCircle },
  fulfilled: { label: 'Fulfilled', bg: 'bg-green-100', text: 'text-green-800', Icon: Package },
  cancelled: { label: 'Cancelled', bg: 'bg-gray-100', text: 'text-gray-500', Icon: XCircle },
};

const StatusBadge: React.FC<{ status: OfficeUseRequestStatus }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.text}`}
    >
      <cfg.Icon className="w-4 h-4" />
      {cfg.label}
    </span>
  );
};

// ── Modal for action notes ───────────────────────────────────────────────────
const ActionModal: React.FC<{
  title: string;
  placeholder: string;
  required?: boolean;
  confirmLabel: string;
  confirmClass?: string;
  onConfirm: (notes: string) => void;
  onClose: () => void;
  processing: boolean;
}> = ({
  title,
  placeholder,
  required,
  confirmLabel,
  confirmClass = 'bg-blue-600 hover:bg-blue-700',
  onConfirm,
  onClose,
  processing,
}) => {
  const [value, setValue] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <textarea
          rows={4}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {required && !value.trim() && (
          <p className="text-xs text-red-500 mt-1">This field is required.</p>
        )}
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(value)}
            disabled={processing || (required && !value.trim())}
            className={`px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 ${confirmClass}`}
          >
            {processing ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────────────
const OfficeUseRequestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { canUserApprove } = useApprovalGuard();

  const { data: request, isLoading, error } = useOfficeUseRequest(Number(id));
  const { data: stockCheck } = useCheckOfficeUseRequestStock(
    Number(id),
    request?.status === 'approved'
  );

  const submitMutation = useSubmitOfficeUseRequest();
  const approveMutation = useApproveOfficeUseRequest();
  const rejectMutation = useRejectOfficeUseRequest();
  const fulfillMutation = useFulfillOfficeUseRequest();
  const cancelMutation = useCancelOfficeUseRequest();

  const [modal, setModal] = useState<null | 'approve' | 'reject' | 'cancel'>(null);
  const [processing, setProcessing] = useState(false);
  const [showLedger, setShowLedger] = useState(true);

  // ── Action handlers ────────────────────────────────────────────────────────
  const runAction = async (mutationFn: () => Promise<unknown>, successMsg: string) => {
    try {
      setProcessing(true);
      await mutationFn();
      success(successMsg);
    } catch (err: any) {
      const data = err?.response?.data;
      showError(data?.error || data?.detail || 'Action failed. Please try again.');
    } finally {
      setProcessing(false);
      setModal(null);
    }
  };

  const handleSubmit = () =>
    runAction(() => submitMutation.mutateAsync(Number(id)), 'Request submitted for approval');

  const handleApprove = (notes: string) =>
    runAction(
      () => approveMutation.mutateAsync({ id: Number(id), data: { notes } }),
      'Request approved'
    );

  const handleReject = (reason: string) =>
    runAction(
      () => rejectMutation.mutateAsync({ id: Number(id), data: { reason } }),
      'Request rejected'
    );

  const handleFulfill = () =>
    runAction(
      () => fulfillMutation.mutateAsync(Number(id)),
      'Request fulfilled — journal entry posted'
    );

  const handleCancel = (reason: string) =>
    runAction(
      () => cancelMutation.mutateAsync({ id: Number(id), data: reason ? { reason } : undefined }),
      'Request cancelled'
    );

  // ── Loading / error states ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-gray-600">Office use request not found or could not be loaded.</p>
        <button
          onClick={() => navigate('/inventory/office-use-requests')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >
          Back to List
        </button>
      </div>
    );
  }

  const allStockOk =
    stockCheck &&
    Array.isArray((stockCheck as any).items) &&
    (stockCheck as any).items.every((i: any) => i.status === 'available');

  const { status } = request;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      {/* Action modals */}
      {modal === 'approve' && (
        <ActionModal
          title="Approve Office Use Request"
          placeholder="Approval notes (optional)..."
          confirmLabel="Approve"
          confirmClass="bg-green-600 hover:bg-green-700"
          onConfirm={handleApprove}
          onClose={() => setModal(null)}
          processing={processing}
        />
      )}
      {modal === 'reject' && (
        <ActionModal
          title="Reject Office Use Request"
          placeholder="Reason for rejection (required)..."
          required
          confirmLabel="Reject"
          confirmClass="bg-red-600 hover:bg-red-700"
          onConfirm={handleReject}
          onClose={() => setModal(null)}
          processing={processing}
        />
      )}
      {modal === 'cancel' && (
        <ActionModal
          title="Cancel Office Use Request"
          placeholder="Reason for cancellation (optional)..."
          confirmLabel="Cancel Request"
          confirmClass="bg-gray-600 hover:bg-gray-700"
          onConfirm={handleCancel}
          onClose={() => setModal(null)}
          processing={processing}
        />
      )}

      {/* Back nav + header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/inventory/office-use-requests')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Office Use Requests
        </button>
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{request.request_number}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {new Date(request.request_date).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={status} />
            {/* Action buttons */}
            {status === 'draft' && (
              <>
                <button
                  onClick={handleSubmit}
                  disabled={processing}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  Submit for Approval
                </button>
                <button
                  onClick={() => setModal('cancel')}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </>
            )}
            {canUserApprove && status === 'submitted' && (
              <>
                <button
                  onClick={() => setModal('approve')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => setModal('reject')}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                >
                  Reject
                </button>
              </>
            )}
            {status === 'approved' && (
              <>
                <button
                  onClick={handleFulfill}
                  disabled={processing || !allStockOk}
                  title={!allStockOk ? 'Insufficient stock for some items' : undefined}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                >
                  Fulfil Request
                </button>
                <button
                  onClick={() => setModal('cancel')}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: main details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Request Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Details</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="flex items-center gap-1.5 text-gray-500 font-medium mb-0.5">
                  <User className="w-4 h-4" /> Requested By
                </dt>
                <dd className="text-gray-900 font-semibold">{request.requested_by_name}</dd>
              </div>
              {request.department && (
                <div>
                  <dt className="flex items-center gap-1.5 text-gray-500 font-medium mb-0.5">
                    <Building className="w-4 h-4" /> Department
                  </dt>
                  <dd className="text-gray-900">{request.department}</dd>
                </div>
              )}
              <div>
                <dt className="flex items-center gap-1.5 text-gray-500 font-medium mb-0.5">
                  <BookOpen className="w-4 h-4" /> Expense Account
                </dt>
                <dd className="text-gray-900">
                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded mr-1">
                    {request.expense_account_code}
                  </span>
                  {request.expense_account_name}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-gray-500 font-medium mb-0.5">
                  <Package className="w-4 h-4" /> Issue Location
                </dt>
                <dd className="text-gray-900">{request.delivery_location_name}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="flex items-center gap-1.5 text-gray-500 font-medium mb-0.5">
                  <FileText className="w-4 h-4" /> Purpose
                </dt>
                <dd className="text-gray-900">{request.purpose}</dd>
              </div>
              {request.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-gray-500 font-medium mb-0.5">Notes</dt>
                  <dd className="text-gray-700 whitespace-pre-line">{request.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                Items ({request.items.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Item</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">SKU</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Qty</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Unit</th>
                    {stockCheck && (
                      <th className="px-4 py-3 text-center font-medium text-gray-500">Stock</th>
                    )}
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {request.items.map(item => {
                    const sc =
                      stockCheck &&
                      Array.isArray((stockCheck as any).items) &&
                      (stockCheck as any).items.find((s: any) => s.item_id === item.item);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{item.item_name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                          {item.item_sku}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">{item.quantity}</td>
                        <td className="px-4 py-3 text-gray-600">{item.unit_of_measure}</td>
                        {stockCheck && (
                          <td className="px-4 py-3 text-center">
                            {sc ? (
                              sc.status === 'available' ? (
                                <span className="inline-flex items-center gap-1 text-green-600">
                                  <CheckCircle className="w-4 h-4" />
                                  {sc.available}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-600">
                                  <AlertCircle className="w-4 h-4" />
                                  {sc.available} / need {item.quantity}
                                </span>
                              )
                            ) : (
                              '–'
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-gray-500 text-xs">{item.notes || '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ledger / Journal Entry */}
          <div className="bg-white rounded-lg shadow">
            <button
              className="w-full flex items-center justify-between px-6 py-4 border-b"
              onClick={() => setShowLedger(v => !v)}
            >
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                Journal Entry / Ledger
              </h2>
              {showLedger ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {showLedger && (
              <div className="p-6">
                {status === 'fulfilled' && request.journal_entry ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-green-900">
                          Journal entry posted on fulfilment
                        </p>
                        <p className="text-xs text-green-700 mt-0.5">
                          Reference:{' '}
                          <span className="font-mono">{request.journal_entry_reference}</span>
                        </p>
                      </div>
                    </div>

                    {/* Accounting summary */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Accounting Entry
                      </p>
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 font-medium">
                            <th className="text-left pb-2">Account</th>
                            <th className="text-right pb-2">Debit</th>
                            <th className="text-right pb-2">Credit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          <tr>
                            <td className="py-2">
                              <span className="font-mono text-xs bg-gray-200 px-1.5 py-0.5 rounded mr-1">
                                {request.expense_account_code}
                              </span>
                              {request.expense_account_name}
                              <span className="ml-2 text-xs text-gray-400">
                                (requested by: {request.requested_by_name})
                              </span>
                            </td>
                            <td className="py-2 text-right font-medium text-red-700">–</td>
                            <td className="py-2 text-right text-gray-400">–</td>
                          </tr>
                          {request.items.map(item => (
                            <tr key={item.id}>
                              <td className="py-2 pl-4 text-gray-600">
                                Inventory – {item.item_name}
                              </td>
                              <td className="py-2 text-right text-gray-400">–</td>
                              <td className="py-2 text-right font-medium text-blue-700">–</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-xs text-gray-500 mt-3">
                        Full amounts are recorded in the journal entry. View the ledger report for
                        running balances.
                      </p>
                    </div>

                    {/* Links to ledger reports */}
                    <div className="flex flex-wrap gap-3">
                      <Link
                        to={`/accounts/ledger?account=${request.expense_account}&ref=${request.journal_entry_reference}`}
                        className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        <BookOpen className="w-4 h-4" />
                        View Expense Account Ledger
                      </Link>
                      <Link
                        to={`/accounts/transactions/${request.journal_entry}`}
                        className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        <FileText className="w-4 h-4" />
                        View Full Journal Entry
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm">
                      {status === 'fulfilled'
                        ? 'Journal entry not found.'
                        : 'The journal entry will be created automatically when this request is fulfilled.'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Entry: <strong>Dr</strong> {request.expense_account_code}{' '}
                      {request.expense_account_name} / <strong>Cr</strong> Inventory account(s)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column: timeline */}
        <div className="space-y-6">
          {/* Approval Timeline */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Timeline</h3>
            <ol className="relative border-l border-gray-200 space-y-4 ml-3">
              {/* Created */}
              <li className="ml-4">
                <div className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-gray-400" />
                <p className="text-xs text-gray-500">
                  {new Date(request.created_at).toLocaleString()}
                </p>
                <p className="text-sm font-medium text-gray-800">Created (Draft)</p>
                <p className="text-xs text-gray-500">by {request.requested_by_name}</p>
              </li>

              {/* Submitted */}
              {request.submitted_at && (
                <li className="ml-4">
                  <div className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-yellow-400" />
                  <p className="text-xs text-gray-500">
                    {new Date(request.submitted_at).toLocaleString()}
                  </p>
                  <p className="text-sm font-medium text-gray-800">Submitted for Approval</p>
                </li>
              )}

              {/* Approved */}
              {request.approved_at && (
                <li className="ml-4">
                  <div className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-blue-500" />
                  <p className="text-xs text-gray-500">
                    {new Date(request.approved_at).toLocaleString()}
                  </p>
                  <p className="text-sm font-medium text-gray-800">Approved</p>
                  {request.approved_by_name && (
                    <p className="text-xs text-gray-500">by {request.approved_by_name}</p>
                  )}
                  {request.approval_notes && (
                    <p className="text-xs text-gray-600 italic mt-0.5">
                      "{request.approval_notes}"
                    </p>
                  )}
                </li>
              )}

              {/* Rejected */}
              {request.rejected_at && (
                <li className="ml-4">
                  <div className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-red-500" />
                  <p className="text-xs text-gray-500">
                    {new Date(request.rejected_at).toLocaleString()}
                  </p>
                  <p className="text-sm font-medium text-gray-800">Rejected</p>
                  {request.rejected_by_name && (
                    <p className="text-xs text-gray-500">by {request.rejected_by_name}</p>
                  )}
                  {request.rejection_reason && (
                    <p className="text-xs text-red-600 italic mt-0.5">
                      "{request.rejection_reason}"
                    </p>
                  )}
                </li>
              )}

              {/* Fulfilled */}
              {request.fulfilled_at && (
                <li className="ml-4">
                  <div className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-green-500" />
                  <p className="text-xs text-gray-500">
                    {new Date(request.fulfilled_at).toLocaleString()}
                  </p>
                  <p className="text-sm font-medium text-gray-800">Fulfilled</p>
                  {request.fulfilled_by_name && (
                    <p className="text-xs text-gray-500">by {request.fulfilled_by_name}</p>
                  )}
                </li>
              )}

              {/* Cancelled */}
              {request.cancelled_at && (
                <li className="ml-4">
                  <div className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-gray-400" />
                  <p className="text-xs text-gray-500">
                    {new Date(request.cancelled_at).toLocaleString()}
                  </p>
                  <p className="text-sm font-medium text-gray-800">Cancelled</p>
                  {request.cancelled_by_name && (
                    <p className="text-xs text-gray-500">by {request.cancelled_by_name}</p>
                  )}
                  {request.cancellation_reason && (
                    <p className="text-xs text-gray-600 italic mt-0.5">
                      "{request.cancellation_reason}"
                    </p>
                  )}
                </li>
              )}
            </ol>
          </div>

          {/* Requester card */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-1.5">
              <User className="w-4 h-4" /> Requester
            </h3>
            <p className="text-indigo-800 font-medium">{request.requested_by_name}</p>
            {request.department && (
              <p className="text-indigo-700 text-sm mt-0.5">{request.department}</p>
            )}
            <div className="mt-3 pt-3 border-t border-indigo-100 text-xs text-indigo-600 space-y-1">
              <p>
                <Calendar className="w-3 h-3 inline mr-1" />
                Requested:{' '}
                {new Date(request.request_date).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
              <p>
                <Package className="w-3 h-3 inline mr-1" />
                {request.total_items} item type{request.total_items !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfficeUseRequestDetail;
