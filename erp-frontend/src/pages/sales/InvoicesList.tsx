// src/pages/sales/InvoicesList.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoiceService, Invoice, InvoiceFilters } from '../../services/invoiceService';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import {
  X,
  Mail,
  DollarSign,
  Eye,
  Edit,
  FileText,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import PaymentRecordingModal, { PaymentData } from '../../components/modals/PaymentRecordingModal';

const InvoicesList: React.FC = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<InvoiceFilters>({});
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [emailData, setEmailData] = useState({ email: '', subject: '', message: '' });
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    reference: '',
    notes: '',
  });
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  // Synchronous guard: useState re-renders async, so a second click can sneak
  // through before the button is disabled. The ref check is immediate.
  const downloadingRef = useRef<Set<number>>(new Set());
  const [pagination, setPagination] = useState({
    count: 0,
    next: null,
    previous: null,
    currentPage: 1,
  });
  const { success, error: showError, info, dismiss } = useToast();
  const { selectedRole } = useAuth();

  // Check if current user role can create invoices
  const canCreateInvoices = selectedRole && !['Principal', 'Officer'].includes(selectedRole);

  // Check if current user role can record payments (mark as paid)
  const canRecordPayments = selectedRole && !['Administrator'].includes(selectedRole);
  const { canUserApprove } = useApprovalGuard();

  useEffect(() => {
    loadInvoices();
  }, [filters]);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const response = await invoiceService.getInvoices(filters);
      setInvoices(response.results || []);
      setPagination({
        count: response.count || 0,
        next: response.next,
        previous: response.previous,
        currentPage: filters.page || 1,
      });
    } catch (error) {
      console.error('Error loading invoices:', error);
      showError('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof InvoiceFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filtering
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleSendEmail = (invoice: Invoice) => {
    // Email sending is disabled in this environment
    showError('Email sending is currently disabled');
    return;
  };

  const handleSendEmailSubmit = async () => {
    if (!selectedInvoice || !emailData.email) {
      showError('Please enter an email address');
      return;
    }

    try {
      await invoiceService.sendInvoiceEmail(selectedInvoice.id, {
        email: emailData.email,
        subject: emailData.subject,
        message: emailData.message,
      });
      success('Invoice sent successfully');
      setShowEmailModal(false);
      setSelectedInvoice(null);
      loadInvoices(); // Refresh to update status
    } catch (error) {
      console.error('Error sending invoice:', error);
      showError('Failed to send invoice');
    }
  };

  const handleDownloadPdf = async (invoice: Invoice) => {
    if (!invoice.is_posted) {
      showError('Invoice must be approved before downloading.');
      return;
    }
    // Synchronous guard — prevents double-clicks before React re-renders
    if (downloadingRef.current.has(invoice.id)) return;
    downloadingRef.current.add(invoice.id);

    const progressToastId = info(`Generating PDF for ${invoice.invoice_number}…`, { duration: 0 });
    setDownloadingId(invoice.id);
    try {
      const response = await fetch(`/api/incomes/invoices/${invoice.id}/download-pdf/`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')}`,
        },
      });

      if (!response.ok) {
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
      success(`PDF downloaded — ${invoice.invoice_number}`);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      dismiss(progressToastId);
      const msg = error instanceof Error ? error.message : 'Failed to download PDF.';
      showError(msg);
    } finally {
      downloadingRef.current.delete(invoice.id);
      setDownloadingId(null);
    }
  };

  const handleMarkAsSent = async (invoice: Invoice) => {
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
      loadInvoices(); // Refresh to update status
    } catch (error) {
      console.error('Error marking invoice as sent:', error);
      showError('Failed to mark invoice as sent');
    }
  };

  const handleVoidInvoice = async (invoice: Invoice) => {
    // Disabled for now
    showError('Void functionality is temporarily disabled');
    return;

    if (window.confirm(`Are you sure you want to void invoice ${invoice.invoice_number}?`)) {
      try {
        await invoiceService.voidInvoice(invoice.id, { reason: 'Voided by user' });
        success('Invoice voided successfully');
        loadInvoices(); // Refresh list
      } catch (error) {
        console.error('Error voiding invoice:', error);
        showError('Failed to void invoice');
      }
    }
  };

  const handleRecordPayment = (invoice: Invoice) => {
    if (!invoice.is_posted) {
      showError('Invoice must be posted before recording payments. Please post the invoice first.');
      return;
    }

    setSelectedInvoice(invoice);
    setPaymentData({
      amount: invoice.balance, // Default to full balance
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'bank_transfer',
      reference: '',
      notes: '',
    });
    setShowPaymentModal(true);
  };

  const handlePostInvoice = async (invoice: Invoice) => {
    if (invoice.is_posted) {
      showError('Invoice is already approved');
      return;
    }

    try {
      await invoiceService.postInvoice(invoice.id);
      success('Invoice approved successfully. Revenue has been recognized.');
      loadInvoices(); // Refresh to update status
    } catch (error: any) {
      console.error('Error approving invoice:', error);
      showError(error.response?.data?.error || 'Failed to approve invoice');
    }
  };

  const handlePaymentSubmit = async (paymentData: PaymentData) => {
    if (!selectedInvoice) {
      showError('No invoice selected');
      return;
    }

    try {
      setSubmittingPayment(true);

      // Use the existing invoice service to record payment
      await invoiceService.recordPayment(selectedInvoice.id, {
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
      setSelectedInvoice(null);
      loadInvoices(); // Refresh to update balances and status
    } catch (error) {
      console.error('Error recording payment:', error);
      showError('Failed to record payment');
      throw error; // Re-throw to let the modal handle it
    } finally {
      setSubmittingPayment(false);
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
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

  const getPaymentProgress = (invoice: Invoice) => {
    const total = parseFloat(invoice.amount);
    const paid = parseFloat(invoice.amount_paid || '0');
    const percentage = total > 0 ? (paid / total) * 100 : 0;
    return { percentage, paid, total };
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales Invoices</h1>
            <p className="text-gray-600">Manage customer invoices and billing</p>
          </div>
          {canCreateInvoices && (
            <button
              onClick={() => navigate('/invoices/create')}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Create Invoice
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status || ''}
              onChange={e => handleFilterChange('status', e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Date Filters */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
            <input
              type="date"
              value={filters.invoice_date || ''}
              onChange={e => handleFilterChange('invoice_date', e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
            <input
              type="date"
              value={filters.due_date || ''}
              onChange={e => handleFilterChange('due_date', e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Invoice number, client..."
              value={filters.search || ''}
              onChange={e => handleFilterChange('search', e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          {/* Clear Filters */}
          <div className="flex items-end">
            <button
              onClick={() => setFilters({})}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="px-6 py-3 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">Invoices ({pagination.count})</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => navigate('/receivables/list?receivable_type=invoice')}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                  >
                    View Receivables
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date / Due
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment Progress
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoices.map(invoice => {
                    const progress = getPaymentProgress(invoice);
                    return (
                      <tr key={invoice.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {invoice.invoice_number}
                          </div>
                          <div className="text-sm text-gray-500">
                            {invoice.description.substring(0, 30)}...
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {invoice.client_name}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {formatDate(invoice.invoice_date)}
                          </div>
                          <div
                            className={`text-sm ${
                              invoice.is_overdue ? 'text-red-600 font-medium' : 'text-gray-500'
                            }`}
                          >
                            Due: {formatDate(invoice.due_date)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {formatCurrency(invoice.amount)}
                          </div>
                          <div className="text-sm text-gray-500">
                            Balance: {formatCurrency(invoice.balance)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                            <div
                              className="bg-green-600 h-2 rounded-full"
                              style={{ width: `${progress.percentage}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatCurrency(progress.paid.toString())} /{' '}
                            {formatCurrency(progress.total.toString())}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(invoice.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => navigate(`/sales/invoices/${invoice.id}/view`)}
                              className="text-blue-600 hover:text-blue-900"
                              title="View Invoice"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {invoice.status === 'draft' && (
                              <button
                                onClick={() => navigate(`/sales/invoices/${invoice.id}/edit`)}
                                className="text-green-600 hover:text-green-900"
                                title="Edit Invoice"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                            {invoice.is_posted ? (
                              <>
                                <button
                                  onClick={() => handleDownloadPdf(invoice)}
                                  disabled={downloadingId === invoice.id}
                                  className="text-purple-600 hover:text-purple-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={
                                    downloadingId === invoice.id
                                      ? 'Generating PDF…'
                                      : 'Download PDF'
                                  }
                                >
                                  {downloadingId === invoice.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <FileText className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleSendEmail(invoice)}
                                  className="text-indigo-600 hover:text-indigo-900"
                                  title="Send Invoice"
                                >
                                  <Mail className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                className="text-gray-300 cursor-not-allowed"
                                disabled
                                title="Download / Send available after approval"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            )}
                            {invoice.status === 'draft' && (
                              <button
                                onClick={() => handleMarkAsSent(invoice)}
                                className="text-blue-600 hover:text-blue-900"
                                title="Mark as Sent"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            {/* {['draft', 'sent'].includes(invoice.status) && (
                              <button
                                onClick={() => handleSendEmail(invoice)}
                                className="text-indigo-600 hover:text-indigo-900"
                                title="Send Invoice"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )} */}
                            {!invoice.is_posted &&
                              invoice.status !== 'cancelled' &&
                              canUserApprove && (
                                <button
                                  onClick={() => handlePostInvoice(invoice)}
                                  className="text-purple-600 hover:text-purple-900"
                                  title="Approve Invoice"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                              )}
                            {invoice.is_posted &&
                              ['sent', 'partial', 'overdue'].includes(invoice.status) &&
                              parseFloat(invoice.balance) > 0 &&
                              canRecordPayments && (
                                <button
                                  onClick={() => handleRecordPayment(invoice)}
                                  className="text-green-600 hover:text-green-900"
                                  title="Record Payment"
                                >
                                  <DollarSign className="w-4 h-4" />
                                </button>
                              )}
                            {invoice.status === 'overdue' && (
                              <button
                                onClick={() => handleVoidInvoice(invoice)}
                                className="text-gray-400 cursor-not-allowed"
                                disabled
                                title="Void Invoice (Coming Soon)"
                              >
                                <AlertTriangle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.count > 0 && (
              <div className="px-6 py-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing page {pagination.currentPage} of {Math.ceil(pagination.count / 20)}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={!pagination.previous}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={!pagination.next}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}

            {invoices.length === 0 && !loading && (
              <div className="text-center py-12">
                <div className="text-gray-500">
                  <div className="text-4xl mb-4">📄</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
                  <p className="text-gray-600 mb-4">
                    Try adjusting your filters{canCreateInvoices ? ' or create a new invoice' : ''}.
                  </p>
                  {canCreateInvoices && (
                    <button
                      onClick={() => navigate('/sales/invoices/create')}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      Create First Invoice
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {/* Email Modal */}
      {showEmailModal && selectedInvoice && (
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
                <p className="text-sm text-gray-600 mb-2">
                  Invoice: {selectedInvoice.invoice_number}
                </p>
                <p className="text-sm text-gray-600">
                  Amount: {formatCurrency(selectedInvoice.amount)}
                </p>
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
                  disabled={!emailData.email}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send Invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Recording Modal */}
      {showPaymentModal && selectedInvoice && (
        <PaymentRecordingModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedInvoice(null);
          }}
          onSubmit={handlePaymentSubmit}
          invoice={selectedInvoice}
          isLoading={submittingPayment}
        />
      )}
    </div>
  );
};

export default InvoicesList;
