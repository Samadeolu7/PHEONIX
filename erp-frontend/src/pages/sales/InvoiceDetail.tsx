// src/pages/sales/InvoiceDetail.tsx
import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoiceService } from '../../services/invoiceService';
import { useInvoice, useInvoicePaymentHistory } from '../../hooks/useInvoices';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeft,
  Edit,
  Mail,
  Download,
  DollarSign,
  X,
  CheckCircle,
  Tag,
  Loader2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import PaymentRecordingModal, { PaymentData } from '../../components/modals/PaymentRecordingModal';

interface ReversalRequest {
  id: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  requested_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string;
  draft_journal_entry_id: number | null;
  draft_journal_entry_ref: string | null;
}

interface PaymentRecord {
  payment_reference: string;
  payment_date: string;
  amount: string;
  is_reversed: boolean;
  reversal_reference: string | null;
  reversal_request: ReversalRequest | null;
}

const InvoiceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    reference: '',
    notes: '',
  });
  const [emailData, setEmailData] = useState({ email: '', subject: '', message: '' });
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const downloadingPdfRef = useRef(false); // synchronous double-click guard
  const [postingInvoice, setPostingInvoice] = useState(false);
  // Request reversal modal
  const [showRequestReversalModal, setShowRequestReversalModal] = useState(false);
  const [requestingReversal, setRequestingReversal] = useState(false);
  const [selectedPaymentRef, setSelectedPaymentRef] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  // Approve/reject modal
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [selectedReversalRequestId, setSelectedReversalRequestId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const { success, error: showError, info, dismiss } = useToast();
  const { selectedRole } = useAuth();

  const invoiceId = Number(id);
  const { data: invoice, isLoading: loading, refetch: refetchInvoice } = useInvoice(invoiceId, !!id);
  const { data: payments = [], refetch: refetchPayments } = useInvoicePaymentHistory(invoiceId, !!id);

  // Check if current user role can record payments
  const canRecordPayments = selectedRole && !['Administrator'].includes(selectedRole);
  // Approver roles — adjust to match your permission setup
  const canApprove =
    selectedRole && ['Administrator', 'Finance Manager', 'Accountant'].includes(selectedRole);

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

  const getStatusBadge = (status: Invoice['status']) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', label: 'Draft' },
      sent: { color: 'bg-blue-100 text-blue-800', label: 'Sent' },
      partial: { color: 'bg-yellow-100 text-yellow-800', label: 'Partial' },
      paid: { color: 'bg-green-100 text-green-800', label: 'Paid' },
      overdue: { color: 'bg-red-100 text-red-800', label: 'Overdue' },
      cancelled: { color: 'bg-gray-100 text-gray-800', label: 'Cancelled' },
    };

    const config = statusConfig[status];
    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

  const handleSendEmail = () => {
    if (!invoice) return;
    setEmailData({
      email: '',
      subject: `Invoice ${invoice.invoice_number}`,
      message: `Please find attached invoice ${invoice.invoice_number} for ${formatCurrency(invoice.amount)}.`,
    });
    setShowEmailModal(true);
  };

  const handleSendEmailSubmit = async () => {
    if (!invoice || !emailData.email) {
      showError('Please enter an email address');
      return;
    }

    try {
      setSendingEmail(true);
      // Email functionality to be implemented
      success('Email functionality will be available soon');
      setShowEmailModal(false);
    } catch (error) {
      console.error('Error sending invoice:', error);
      showError('Failed to send invoice');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!invoice) return;

    // Guard: backend also checks this, but give instant feedback from the frontend
    if (!invoice.is_posted) {
      showError('Invoice must be approved / posted before a PDF can be downloaded.');
      return;
    }

    // Synchronous guard — useState re-renders async, so a rapid second click
    // can sneak through before the button is visually disabled.
    if (downloadingPdfRef.current) return;
    downloadingPdfRef.current = true;

    // Show a sticky toast immediately so the user knows work is happening
    const progressToastId = info('Generating PDF, please wait…', { duration: 0 });
    setDownloadingPdf(true);

    try {
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const response = await fetch(`/api/incomes/invoices/${invoice.id}/download-pdf/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // Try to surface the server's own error message
        let serverMsg = `HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          serverMsg = errBody?.error || errBody?.detail || serverMsg;
        } catch {
          /* non-JSON body — keep default */
        }
        throw new Error(serverMsg);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoice.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      dismiss(progressToastId);
      success('PDF downloaded successfully');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      dismiss(progressToastId);
      const msg = error instanceof Error ? error.message : 'Failed to download PDF.';
      showError(msg);
    } finally {
      downloadingPdfRef.current = false;
      setDownloadingPdf(false);
    }
  };

  const handlePostInvoice = async () => {
    if (!invoice) return;

    if (invoice.is_posted) {
      showError('Invoice is already posted');
      return;
    }

    try {
      setPostingInvoice(true);
      await invoiceService.postInvoice(invoice.id);
      success('Invoice posted successfully. Revenue has been recognized.');
      refetchInvoice(); // Reload to get updated is_posted status
    } catch (error: any) {
      console.error('Error posting invoice:', error);
      showError(error.response?.data?.error || 'Failed to post invoice');
    } finally {
      setPostingInvoice(false);
    }
  };

  const handleRecordPayment = () => {
    if (!invoice) return;

    if (!invoice.is_posted) {
      showError('Invoice must be posted before recording payments');
      return;
    }

    setPaymentData({
      amount: invoice.balance,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'bank_transfer',
      reference: '',
      notes: '',
    });
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async (paymentData: PaymentData) => {
    if (!invoice) {
      showError('No invoice selected');
      return;
    }

    try {
      setSubmittingPayment(true);
      await invoiceService.recordPayment(invoice.id, {
        amount: paymentData.amount,
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        bank_account_id: paymentData.bank_account_id,
        reference: paymentData.reference,
        notes: paymentData.notes,
        line_item_allocations: paymentData.line_item_allocations,
      });

      success('Payment recorded successfully');
      setShowPaymentModal(false);
      refetchInvoice();
      refetchPayments();
    } catch (error) {
      console.error('Error recording payment:', error);
      showError('Failed to record payment');
      throw error;
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleOpenRequestReversalModal = (ref: string) => {
    setSelectedPaymentRef(ref);
    setReverseReason('');
    setShowRequestReversalModal(true);
  };

  const handleRequestReversal = async () => {
    if (!invoice) return;
    try {
      setRequestingReversal(true);
      const res = await invoiceService.requestPaymentReversal(invoice.id, {
        payment_reference: selectedPaymentRef,
        reason: reverseReason,
      });
      success(
        `Reversal request submitted (Draft GL: ${res.draft_journal_entry_ref}). ` +
          'Awaiting approver review.'
      );
      setShowRequestReversalModal(false);
      refetchPayments();
    } catch (error: any) {
      showError(error?.response?.data?.error || 'Failed to submit reversal request');
    } finally {
      setRequestingReversal(false);
    }
  };

  const handleOpenApprovalModal = (action: 'approve' | 'reject', requestId: number) => {
    setApprovalAction(action);
    setSelectedReversalRequestId(requestId);
    setRejectionReason('');
    setShowApprovalModal(true);
  };

  const handleApprovalSubmit = async () => {
    if (!invoice || !selectedReversalRequestId) return;
    try {
      setSubmittingApproval(true);
      if (approvalAction === 'approve') {
        await invoiceService.approvePaymentReversal(invoice.id, {
          reversal_request_id: selectedReversalRequestId,
        });
        success('Payment reversal approved and executed successfully.');
      } else {
        await invoiceService.rejectPaymentReversal(invoice.id, {
          reversal_request_id: selectedReversalRequestId,
          rejection_reason: rejectionReason,
        });
        success('Reversal request rejected. Payment remains in effect.');
      }
      setShowApprovalModal(false);
      refetchInvoice();
      refetchPayments();
    } catch (error: any) {
      showError(error?.response?.data?.error || `Failed to ${approvalAction} reversal request`);
    } finally {
      setSubmittingApproval(false);
    }
  };

  const handleMarkAsSent = async () => {
    if (!invoice) return;

    try {
      await invoiceService.markAsSent(invoice.id, {
        client: invoice.client,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date,
        description: invoice.description,
        amount: invoice.amount,
        amount_paid: invoice.amount_paid || '0',
        fee_structure: invoice.fee_structure || 0,
        status: 'sent',
        metadata: invoice.metadata || {},
        inventory_allocation: invoice.inventory_allocation || 0,
      });

      success('Invoice marked as sent successfully');
      refetchInvoice();
    } catch (error) {
      console.error('Error marking invoice as sent:', error);
      showError('Failed to mark invoice as sent');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Invoice not found</h3>
        <button
          onClick={() => navigate('/sales/invoices')}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Back to Invoices
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/sales/invoices')}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Invoice {invoice.invoice_number}</h1>
              <p className="text-gray-600">View invoice details and manage actions</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {getStatusBadge(invoice.status)}
            <div className="flex space-x-2">
              {invoice.status === 'draft' && (
                <>
                  <button
                    onClick={() => navigate(`/sales/invoices/${invoice.id}/edit`)}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={handleMarkAsSent}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Mark as Sent
                  </button>
                </>
              )}
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf || !invoice.is_posted}
                title={
                  !invoice.is_posted
                    ? 'Available after invoice is approved / posted'
                    : 'Download invoice as PDF'
                }
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloadingPdf ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                {downloadingPdf ? 'Generating…' : 'Download PDF'}
              </button>
              {/* {['draft', 'sent'].includes(invoice.status) && (
                <button
                  onClick={handleSendEmail}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  <Mail className="h-4 w-4 mr-1" />
                  Send
                </button>
              )} */}
              {!invoice.is_posted && invoice.status !== 'cancelled' && canRecordPayments && (
                <button
                  onClick={handlePostInvoice}
                  disabled={postingInvoice}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {postingInvoice ? 'Posting...' : 'Post Invoice'}
                </button>
              )}
              {invoice.is_posted &&
                ['sent', 'partial', 'overdue'].includes(invoice.status) &&
                parseFloat(invoice.balance) > 0 &&
                canRecordPayments && (
                  <button
                    onClick={handleRecordPayment}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Record Payment
                  </button>
                )}
              {invoice.status === 'paid' && (
                <button
                  onClick={() => navigate(`/inventory/material-requests?invoice=${invoice.id}`)}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
                  title="Create Material Request for this invoice"
                >
                  📦 Material Request
                </button>
              )}
              {invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
                <button
                  onClick={() => navigate('/discounts/apply')}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700"
                  title="Apply a discount program to this invoice"
                >
                  <Tag className="h-4 w-4 mr-1" />
                  Apply Discount
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Details */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Invoice Details</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Basic Information</h4>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Invoice Number:</dt>
                  <dd className="text-sm font-medium text-gray-900">{invoice.invoice_number}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Client:</dt>
                  <dd className="text-sm font-medium text-gray-900">{invoice.client_name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Status:</dt>
                  <dd className="text-sm">{getStatusBadge(invoice.status)}</dd>
                </div>
              </dl>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Dates & Amounts</h4>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Invoice Date:</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatDate(invoice.invoice_date)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Due Date:</dt>
                  <dd
                    className={`text-sm font-medium ${invoice.is_overdue ? 'text-red-600' : 'text-gray-900'}`}
                  >
                    {formatDate(invoice.due_date)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Amount:</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatCurrency(invoice.amount)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Amount Paid:</dt>
                  <dd className="text-sm font-medium text-green-600">
                    {formatCurrency(invoice.amount_paid || '0')}
                  </dd>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <dt className="text-sm font-medium text-gray-700">Balance:</dt>
                  <dd className="text-sm font-bold text-gray-900">
                    {formatCurrency(invoice.balance)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Description</h3>
        </div>
        <div className="p-6">
          <p className="text-gray-900 whitespace-pre-wrap">{invoice.description}</p>
        </div>
      </div>

      {/* Payment Progress */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Payment Progress</h3>
        </div>
        <div className="p-6">
          <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
            <div
              className="bg-green-600 h-4 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, (parseFloat(invoice.amount_paid || '0') / parseFloat(invoice.amount)) * 100)}%`,
              }}
            ></div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">
              Paid: {formatCurrency(invoice.amount_paid || '0')}
            </span>
            <span className="text-gray-500">Total: {formatCurrency(invoice.amount)}</span>
          </div>
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Mail className="h-6 w-6 text-blue-600 mr-2" />
                  <h3 className="text-lg font-medium text-gray-900">Send Invoice</h3>
                </div>
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Invoice: {invoice.invoice_number}</p>
                <p className="text-sm text-gray-600">Amount: {formatCurrency(invoice.amount)}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={emailData.email}
                    onChange={e => setEmailData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Enter recipient email"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={emailData.subject}
                    onChange={e => setEmailData(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    value={emailData.message}
                    onChange={e => setEmailData(prev => ({ ...prev, message: e.target.value }))}
                    rows={3}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendEmailSubmit}
                  disabled={!emailData.email || sendingEmail}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingEmail ? 'Sending...' : 'Send Invoice'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment History */}
      {(payments.length > 0) && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Payment History</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {payments.map(p => {
                const rr = p.reversal_request;
                const hasPendingRequest = rr?.status === 'pending';
                const hasApprovedRequest = rr?.status === 'approved';
                const hasRejectedRequest = rr?.status === 'rejected';

                return (
                  <div key={p.payment_reference} className="px-6 py-4 space-y-2">
                    {/* Main row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <DollarSign className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 font-mono">
                            {p.payment_reference}
                          </p>
                          <p className="text-xs text-gray-500">{formatDate(p.payment_date)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-900">
                          {formatCurrency(p.amount)}
                        </span>

                        {/* Payment status badge */}
                        {p.is_reversed && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            <RotateCcw size={10} /> Reversed
                          </span>
                        )}

                        {/* Pending request badge + approver actions */}
                        {hasPendingRequest && !p.is_reversed && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            <AlertTriangle size={10} /> Reversal Pending
                          </span>
                        )}

                        {/* Rejected badge */}
                        {hasRejectedRequest && !p.is_reversed && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Reversal Rejected
                          </span>
                        )}

                        {/* Request reversal — only if no active/approved request and not already reversed */}
                        {!p.is_reversed &&
                          !hasPendingRequest &&
                          !hasApprovedRequest &&
                          canRecordPayments && (
                            <button
                              onClick={() => handleOpenRequestReversalModal(p.payment_reference)}
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-orange-700 border border-orange-200 bg-orange-50 rounded-md hover:bg-orange-100 transition-colors"
                            >
                              <RotateCcw size={11} /> Request Reversal
                            </button>
                          )}

                        {/* Approve / Reject — for approvers on pending requests */}
                        {hasPendingRequest && !p.is_reversed && canApprove && rr && (
                          <>
                            <button
                              onClick={() => handleOpenApprovalModal('approve', rr.id)}
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-green-700 border border-green-200 bg-green-50 rounded-md hover:bg-green-100 transition-colors"
                            >
                              <CheckCircle size={11} /> Approve
                            </button>
                            <button
                              onClick={() => handleOpenApprovalModal('reject', rr.id)}
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-red-600 border border-red-200 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                            >
                              <X size={11} /> Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Reversal request detail strip */}
                    {rr && (
                      <div
                        className={`ml-7 rounded-md px-3 py-2 text-xs space-y-1 ${
                          hasPendingRequest
                            ? 'bg-yellow-50 border border-yellow-100'
                            : hasRejectedRequest
                              ? 'bg-gray-50 border border-gray-100'
                              : 'bg-green-50 border border-green-100'
                        }`}
                      >
                        <p className="font-medium text-gray-700">
                          Reversal request by{' '}
                          <span className="font-semibold">{rr.requested_by}</span>
                          {' · '}
                          <span
                            className={`capitalize ${
                              hasPendingRequest
                                ? 'text-yellow-700'
                                : hasRejectedRequest
                                  ? 'text-gray-600'
                                  : 'text-green-700'
                            }`}
                          >
                            {rr.status}
                          </span>
                        </p>
                        <p className="text-gray-600">Reason: {rr.reason}</p>
                        {rr.draft_journal_entry_ref && (
                          <p className="text-gray-500">
                            Draft GL entry:{' '}
                            <span className="font-mono">{rr.draft_journal_entry_ref}</span>
                          </p>
                        )}
                        {rr.approved_by && (
                          <p className="text-gray-600">
                            {hasRejectedRequest ? 'Rejected' : 'Approved'} by {rr.approved_by}
                            {rr.rejection_reason && `: ${rr.rejection_reason}`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {/* Request Reversal Modal */}
      {showRequestReversalModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-24 mx-auto p-5 border w-[420px] shadow-lg rounded-md bg-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-orange-500" />
                <h3 className="text-lg font-medium text-gray-900">Request Payment Reversal</h3>
              </div>
              <button
                onClick={() => setShowRequestReversalModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-md px-3 py-2 mb-4 text-xs text-orange-800">
              <p className="font-semibold mb-1">Two-step approval required</p>
              <p>
                Submitting this request will create a draft journal entry for review. An authorised
                approver must approve before the payment is reversed.
              </p>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              Payment: <span className="font-mono font-medium">{selectedPaymentRef}</span>
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reverseReason}
                onChange={e => setReverseReason(e.target.value)}
                rows={3}
                placeholder="Provide a detailed reason (minimum 10 characters)"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRequestReversalModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestReversal}
                disabled={requestingReversal || reverseReason.trim().length < 10}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {requestingReversal ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve / Reject Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-24 mx-auto p-5 border w-[420px] shadow-lg rounded-md bg-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {approvalAction === 'approve' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                )}
                <h3 className="text-lg font-medium text-gray-900">
                  {approvalAction === 'approve' ? 'Approve Reversal' : 'Reject Reversal'}
                </h3>
              </div>
              <button
                onClick={() => setShowApprovalModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {approvalAction === 'approve' ? (
              <div className="bg-green-50 border border-green-100 rounded-md px-3 py-2 mb-4 text-xs text-green-800">
                <p className="font-semibold mb-1">This action is irreversible</p>
                <p>
                  Approving will post the draft GL entry, reverse the original payment transaction,
                  and reduce the invoice's paid balance accordingly.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-3">
                  The draft GL entry will be voided and the payment will remain in effect.
                </p>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rejection Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    rows={3}
                    placeholder="Provide a reason (minimum 10 characters)"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowApprovalModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleApprovalSubmit}
                disabled={
                  submittingApproval ||
                  (approvalAction === 'reject' && rejectionReason.trim().length < 10)
                }
                className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
                  approvalAction === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {submittingApproval
                  ? 'Processing…'
                  : approvalAction === 'approve'
                    ? 'Confirm Approval'
                    : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Recording Modal */}
      {showPaymentModal && invoice && (
        <PaymentRecordingModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onSubmit={handlePaymentSubmit}
          invoice={invoice}
          isLoading={submittingPayment}
        />
      )}
    </div>
  );
};

export default InvoiceDetail;
