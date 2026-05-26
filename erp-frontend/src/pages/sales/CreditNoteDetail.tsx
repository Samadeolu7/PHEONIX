// src/pages/sales/CreditNoteDetail.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoiceService, CreditNote } from '../../services/invoiceService';
import { useToast } from '../../hooks/useToast';
import {
  ArrowLeft,
  Edit,
  Download,
  CheckCircle,
  XCircle,
  CreditCard,
  Calendar,
  User,
  FileText,
  AlertTriangle,
  RotateCcw,
  Send,
} from 'lucide-react';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: any) => void;
  title: string;
  description: string;
  actionType: 'apply' | 'cancel' | 'reverse' | 'issue';
  loading: boolean;
}

const ActionModal: React.FC<ActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  actionType,
  loading,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let data: any = {};

    switch (actionType) {
      case 'apply':
        data = { notes: notes || undefined };
        break;
      case 'cancel':
        data = { cancellation_reason: inputValue };
        break;
      case 'reverse':
        data = { reversal_reason: inputValue };
        break;
      case 'issue':
        data = {}; // Issue doesn't require additional data
        break;
    }

    onConfirm(data);
  };

  const requiresInput = actionType === 'cancel' || actionType === 'reverse';
  const inputLabel = actionType === 'cancel' ? 'Cancellation Reason' : 'Reversal Reason';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
        <p className="text-sm text-gray-600 mb-4">{description}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {requiresInput && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{inputLabel} *</label>
              <textarea
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder={`Enter ${inputLabel.toLowerCase()}...`}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          )}

          {actionType === 'apply' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional notes about applying the credit..."
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (requiresInput && !inputValue.trim())}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              )}
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CreditNoteDetail: React.FC = () => {
  const { invoiceId, creditNoteId } = useParams<{ invoiceId: string; creditNoteId: string }>();
  const navigate = useNavigate();
  const [creditNote, setCreditNote] = useState<CreditNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: 'apply' | 'cancel' | 'reverse' | 'issue';
    title: string;
    description: string;
  }>({
    isOpen: false,
    type: 'apply',
    title: '',
    description: '',
  });
  const { success, error: showError } = useToast();

  useEffect(() => {
    if (invoiceId && creditNoteId) {
      loadCreditNote();
    }
  }, [invoiceId, creditNoteId]);

  const loadCreditNote = async () => {
    try {
      setLoading(true);
      const creditNoteData = await invoiceService.getCreditNote(
        Number(invoiceId),
        Number(creditNoteId)
      );
      setCreditNote(creditNoteData);
    } catch (error) {
      console.error('Error loading credit note:', error);
      showError('Failed to load credit note');
      navigate(`/sales/invoices/${invoiceId}/credit-notes`);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (actionType: 'apply' | 'cancel' | 'reverse' | 'issue', data: any) => {
    if (!creditNote || !invoiceId || !creditNoteId) return;

    try {
      setActionLoading(true);

      switch (actionType) {
        case 'apply':
          await invoiceService.applyCreditNote(Number(invoiceId), Number(creditNoteId), data);
          success('Credit note applied successfully');
          break;
        case 'cancel':
          await invoiceService.cancelCreditNote(Number(invoiceId), Number(creditNoteId), data);
          success('Credit note cancelled successfully');
          break;
        case 'reverse':
          await invoiceService.reverseCreditNote(Number(invoiceId), Number(creditNoteId), data);
          success('Credit note reversed successfully');
          break;
        case 'issue':
          // For issue, we need to pass the full credit note data
          const issueData = {
            original_invoice: creditNote.original_invoice,
            client: creditNote.client.id,
            issue_date: creditNote.issue_date,
            reason: creditNote.reason,
            notes: creditNote.notes,
            subtotal: creditNote.subtotal,
            discount: creditNote.discount,
            tax_amount: creditNote.tax_amount,
            total_amount: creditNote.total_amount,
            status: 'issued' as const,
            items: creditNote.items.map(item => ({
              item: item.item,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_price: item.total_price,
            })),
          };
          await invoiceService.issueCreditNote(Number(invoiceId), Number(creditNoteId), issueData);
          success('Credit note issued successfully');
          break;
      }

      setActionModal({ ...actionModal, isOpen: false });
      loadCreditNote(); // Reload to get updated data
    } catch (error) {
      console.error(`Error ${actionType}ing credit note:`, error);
      showError(`Failed to ${actionType} credit note`);
    } finally {
      setActionLoading(false);
    }
  };

  const openActionModal = (type: 'apply' | 'cancel' | 'reverse' | 'issue') => {
    const modalConfig = {
      apply: {
        title: 'Apply Credit Note',
        description:
          'This will apply the credit note to the customer account and create journal entries. This action cannot be undone.',
      },
      cancel: {
        title: 'Cancel Credit Note',
        description:
          "This will cancel the credit note. Only draft or issued credit notes that haven't been applied can be cancelled.",
      },
      reverse: {
        title: 'Reverse Credit Note',
        description:
          'This will reverse the applied credit note, creating reversing journal entries and restoring the customer balance.',
      },
      issue: {
        title: 'Issue Credit Note',
        description: 'This will change the status from draft to issued, making it official.',
      },
    };

    setActionModal({
      isOpen: true,
      type,
      ...modalConfig[type],
    });
  };

  const handleDownloadPdf = async () => {
    if (!creditNote || !invoiceId || !creditNoteId) return;

    try {
      const blob = await invoiceService.getCreditNotePdf(Number(invoiceId), Number(creditNoteId));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `credit-note-${creditNote.credit_note_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      showError('Failed to download PDF');
    }
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB');
  };

  const getStatusBadge = (status: CreditNote['status']) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', label: 'Draft', icon: FileText },
      issued: { color: 'bg-blue-100 text-blue-800', label: 'Issued', icon: Send },
      applied: { color: 'bg-green-100 text-green-800', label: 'Applied', icon: CheckCircle },
      cancelled: { color: 'bg-red-100 text-red-800', label: 'Cancelled', icon: XCircle },
    };

    const config = statusConfig[status];
    const IconComponent = config.icon;

    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.color}`}
      >
        <IconComponent className="h-3 w-3 mr-1" />
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!creditNote) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Credit note not found</h3>
        <button
          onClick={() => navigate(`/sales/invoices/${invoiceId}/credit-notes`)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Back to Credit Notes
        </button>
      </div>
    );
  }

  const canEdit = creditNote.status === 'draft';
  const canIssue = creditNote.status === 'draft';
  const canApply =
    creditNote.status === 'issued' &&
    !creditNote.applied_to_account &&
    creditNote.can_be_applied === 'true';
  const canCancel =
    (creditNote.status === 'draft' || creditNote.status === 'issued') &&
    !creditNote.applied_to_account &&
    creditNote.can_be_cancelled === 'true';
  const canReverse =
    creditNote.status === 'applied' && creditNote.applied_to_account && !creditNote.reversed;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate(`/sales/invoices/${invoiceId}/credit-notes`)}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Credit Note {creditNote.credit_note_number}
              </h1>
              <p className="text-gray-600">
                For Invoice {creditNote.original_invoice} • {creditNote.client.name}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {getStatusBadge(creditNote.status)}
            <div className="flex space-x-2">
              {canEdit && (
                <button
                  onClick={() =>
                    navigate(`/sales/invoices/${invoiceId}/credit-notes/${creditNote.id}/edit`)
                  }
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </button>
              )}
              <button
                onClick={handleDownloadPdf}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                <Download className="h-4 w-4 mr-1" />
                PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Status Alerts */}
      {creditNote.reversed && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Credit Note Reversed</h3>
              <p className="text-sm text-red-700 mt-1">
                This credit note was reversed on {formatDateTime(creditNote.reversed_date!)}
                {creditNote.reversal_reason && ` - ${creditNote.reversal_reason}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {creditNote.applied_to_account && !creditNote.reversed && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-green-800">Credit Applied</h3>
              <p className="text-sm text-green-700 mt-1">
                Applied to customer account on {formatDateTime(creditNote.applied_date!)}
                {creditNote.applied_by && ` by ${creditNote.applied_by.name}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Credit Note Details */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Credit Note Details</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Basic Information</h4>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Credit Note Number:</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {creditNote.credit_note_number}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Original Invoice:</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {creditNote.original_invoice}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Customer:</dt>
                  <dd className="text-sm font-medium text-gray-900">{creditNote.client.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Status:</dt>
                  <dd className="text-sm">{getStatusBadge(creditNote.status)}</dd>
                </div>
              </dl>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Dates & Amounts</h4>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Issue Date:</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatDate(creditNote.issue_date)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Created By:</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {creditNote.created_by.name}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Total Amount:</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatCurrency(creditNote.total_amount)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Remaining Amount:</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatCurrency(creditNote.remaining_amount)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Reason & Notes */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Reason & Notes</h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <p className="text-gray-900">{creditNote.reason}</p>
            </div>
            {creditNote.notes && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Notes
                </label>
                <p className="text-gray-900 whitespace-pre-wrap">{creditNote.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Items ({creditNote.items.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Item
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Unit Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {creditNote.items.map(item => (
                <tr key={item.id}>
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{item.item_name}</div>
                      <div className="text-sm text-gray-500">ID: {item.item}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{item.quantity}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {formatCurrency(item.total_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Totals</h3>
        </div>
        <div className="p-6">
          <div className="max-w-md ml-auto space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Subtotal:</span>
              <span className="font-medium">{formatCurrency(creditNote.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Discount:</span>
              <span className="font-medium">-{formatCurrency(creditNote.discount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Tax:</span>
              <span className="font-medium">{formatCurrency(creditNote.tax_amount)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="font-medium text-gray-900">Total Amount:</span>
              <span className="font-bold text-lg text-gray-900">
                {formatCurrency(creditNote.total_amount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Actions</h3>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap gap-3">
            {canIssue && (
              <button
                onClick={() => openActionModal('issue')}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                <Send className="h-4 w-4 mr-2" />
                Issue Credit Note
              </button>
            )}
            {canApply && (
              <button
                onClick={() => openActionModal('apply')}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Apply to Account
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => openActionModal('cancel')}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel Credit Note
              </button>
            )}
            {canReverse && (
              <button
                onClick={() => openActionModal('reverse')}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reverse Credit Note
              </button>
            )}
          </div>

          {!canIssue && !canApply && !canCancel && !canReverse && (
            <p className="text-sm text-gray-500">No actions available for this credit note.</p>
          )}
        </div>
      </div>

      {/* Action Modal */}
      <ActionModal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal({ ...actionModal, isOpen: false })}
        onConfirm={data => handleAction(actionModal.type, data)}
        title={actionModal.title}
        description={actionModal.description}
        actionType={actionModal.type}
        loading={actionLoading}
      />
    </div>
  );
};

export default CreditNoteDetail;
