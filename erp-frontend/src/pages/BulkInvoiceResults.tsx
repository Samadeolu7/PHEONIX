import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  AlertCircle,
  Send,
  Eye,
  Download,
  ArrowLeft,
  FileText,
  Mail,
  RefreshCw,
  Filter,
  Search,
  X,
} from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { invoiceService, BulkInvoiceResult } from '../services/invoiceService';

interface BulkInvoiceResultsProps {
  result?: BulkInvoiceResult;
}

const BulkInvoiceResults: React.FC<BulkInvoiceResultsProps> = ({ result: propResult }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  // Get result from props, location state, or URL params
  const [result, setResult] = useState<BulkInvoiceResult | null>(
    propResult || location.state?.result || null
  );
  const [resultId, setResultId] = useState<string | null>(
    new URLSearchParams(location.search).get('resultId')
  );

  // Load result from storage if resultId is provided
  useEffect(() => {
    if (resultId && !result) {
      // Try to load from sessionStorage
      const storedResult = sessionStorage.getItem(`bulkInvoiceResult_${resultId}`);
      if (storedResult) {
        try {
          const parsedResult = JSON.parse(storedResult);
          setResult(parsedResult);
        } catch (error) {
          console.error('Error parsing stored result:', error);
        }
      }
    }
  }, [resultId, result]);

  // Normalize the result to ensure invoices array is available
  useEffect(() => {
    if (result && result.created_invoices && !result.invoices) {
      setResult(prev =>
        prev
          ? {
              ...prev,
              invoices: prev.created_invoices.map(invoice => ({
                id: invoice.id,
                invoice_number: invoice.invoice_number,
                client_name: invoice.client_name,
                amount: invoice.amount,
                status: invoice.status || ('created' as const),
                error: invoice.error,
              })),
              errors: prev.errors || [],
            }
          : null
      );
    }
  }, [result]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'created' | 'sent' | 'failed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState('');

  // If no result is available, show a helpful message instead of redirecting
  useEffect(() => {
    if (!result && !resultId) {
      // Don't redirect immediately, let user see the page
      console.log('No bulk invoice results available');
    }
  }, [result, resultId]);

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Results Found</h2>
          <p className="text-gray-600 mb-4">No bulk invoice results to display.</p>
          <button
            onClick={() => navigate('/bulk-invoice-wizard')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Bulk Invoice Wizard
          </button>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  const filteredInvoices = (result.invoices || []).filter(invoice => {
    const matchesStatus = filterStatus === 'all' || invoice.status === filterStatus;
    const matchesSearch =
      searchTerm === '' ||
      invoice.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleSelectInvoice = (invoiceId: number) => {
    setSelectedInvoices(prev =>
      prev.includes(invoiceId) ? prev.filter(id => id !== invoiceId) : [...prev, invoiceId]
    );
  };

  const handleSelectAll = () => {
    const selectableInvoices = filteredInvoices
      .filter(inv => inv.status === 'created')
      .map(inv => inv.id);
    setSelectedInvoices(selectableInvoices);
  };

  const handleDeselectAll = () => {
    setSelectedInvoices([]);
  };

  const handleBulkSend = async () => {
    if (selectedInvoices.length === 0) {
      showError('Please select at least one invoice to send');
      return;
    }

    try {
      setIsSending(true);
      const sendResult = await invoiceService.sendBulkInvoices(selectedInvoices, {
        email_template: emailTemplate || undefined,
      });

      if (sendResult.success) {
        success(`Successfully sent ${sendResult.sent_count} invoices`);

        // Update the result state to reflect sent invoices
        setResult(prev => {
          if (!prev || !prev.invoices) return prev;

          const updatedInvoices = prev.invoices.map(invoice => {
            const sendResultItem = sendResult.results.find(r => r.id === invoice.id);
            if (sendResultItem && sendResultItem.status === 'sent') {
              return { ...invoice, status: 'sent' as const };
            }
            return invoice;
          });

          return {
            ...prev,
            invoices: updatedInvoices,
          };
        });

        setSelectedInvoices([]);
        setShowSendModal(false);
      } else {
        showError(`Failed to send ${sendResult.failed_count} invoices`);
      }
    } catch (error: any) {
      console.error('Error sending bulk invoices:', error);
      showError(error.message || 'Failed to send invoices');
    } finally {
      setIsSending(false);
    }
  };

  const handleViewInvoice = async (invoiceId: number) => {
    try {
      const blob = await invoiceService.getInvoicePdf(invoiceId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error: any) {
      console.error('Error viewing invoice:', error);
      showError('Failed to load invoice PDF');
    }
  };

  const handleDownloadInvoice = async (invoiceId: number, invoiceNumber: string) => {
    try {
      const blob = await invoiceService.getInvoicePdf(invoiceId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error downloading invoice:', error);
      showError('Failed to download invoice PDF');
    }
  };

  const totalAmount = (result.invoices || []).reduce((sum, inv) => sum + parseFloat(inv.amount), 0);

  const createdInvoices = (result.invoices || []).filter(inv => inv.status === 'created');
  const sentInvoices = (result.invoices || []).filter(inv => inv.status === 'sent');
  const failedInvoices = (result.invoices || []).filter(inv => inv.status === 'failed');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center">
              <button
                onClick={() => navigate(-1)}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                  <FileText className="w-8 h-8 text-blue-600 mr-3" />
                  Bulk Invoice Results
                </h1>
                <p className="text-gray-600 mt-1">
                  Review and manage your bulk invoice generation results
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {createdInvoices.length > 0 && (
                <button
                  onClick={() => setShowSendModal(true)}
                  disabled={selectedInvoices.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send Selected ({selectedInvoices.length})
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div
            className={`bg-white rounded-lg shadow p-6 ${
              result.success ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'
            }`}
          >
            <div className="flex items-center">
              {result.success ? (
                <CheckCircle className="w-8 h-8 text-green-600" />
              ) : (
                <AlertCircle className="w-8 h-8 text-red-600" />
              )}
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Status</p>
                <p
                  className={`text-lg font-semibold ${
                    result.success ? 'text-green-900' : 'text-red-900'
                  }`}
                >
                  {result.success ? 'Completed' : 'Completed with Errors'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Created</p>
                <p className="text-2xl font-bold text-green-900">{result.created_count}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <AlertCircle className="w-8 h-8 text-red-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Failed</p>
                <p className="text-2xl font-bold text-red-900">{result.failed_count}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <FileText className="w-8 h-8 text-blue-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Total Amount</p>
                <p className="text-2xl font-bold text-blue-900">
                  {formatCurrency(totalAmount.toString())}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search invoices..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value as any)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="created">Created</option>
                  <option value="sent">Sent</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>

            {createdInvoices.length > 0 && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
                >
                  Select All Created
                </button>
                <button
                  onClick={handleDeselectAll}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                >
                  Deselect All
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Invoice List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Invoices ({filteredInvoices.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={
                        selectedInvoices.length === createdInvoices.length &&
                        createdInvoices.length > 0
                      }
                      onChange={
                        selectedInvoices.length === createdInvoices.length
                          ? handleDeselectAll
                          : handleSelectAll
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
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
                {filteredInvoices.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedInvoices.includes(invoice.id)}
                        onChange={() => handleSelectInvoice(invoice.id)}
                        disabled={invoice.status !== 'created'}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {invoice.invoice_number}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{invoice.client_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(invoice.amount)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          invoice.status === 'created'
                            ? 'bg-green-100 text-green-800'
                            : invoice.status === 'sent'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {invoice.status === 'created' && <CheckCircle className="w-3 h-3 mr-1" />}
                        {invoice.status === 'sent' && <Send className="w-3 h-3 mr-1" />}
                        {invoice.status === 'failed' && <AlertCircle className="w-3 h-3 mr-1" />}
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                      {invoice.error && (
                        <div className="text-xs text-red-600 mt-1">{invoice.error}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        {invoice.status !== 'failed' && (
                          <>
                            <button
                              onClick={() => handleViewInvoice(invoice.id)}
                              className="text-blue-600 hover:text-blue-900"
                              title="View Invoice"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                handleDownloadInvoice(invoice.id, invoice.invoice_number)
                              }
                              className="text-green-600 hover:text-green-900"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredInvoices.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
              <p className="text-gray-500">Try adjusting your search or filter criteria.</p>
            </div>
          )}
        </div>

        {/* Errors Section */}
        {(result.errors || []).length > 0 && (
          <div className="mt-8 bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 mr-2" />
              <h3 className="text-lg font-medium text-red-900">Errors Encountered</h3>
            </div>
            <ul className="text-sm text-red-800 space-y-2">
              {(result.errors || []).map((error, index) => (
                <li key={index} className="flex items-start">
                  <span className="text-red-600 mr-2">•</span>
                  {error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Bulk Send Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Send Invoices</h3>
                <button
                  onClick={() => setShowSendModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-4">
                Send {selectedInvoices.length} selected invoices to clients via email.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Template (Optional)
                </label>
                <textarea
                  value={emailTemplate}
                  onChange={e => setEmailTemplate(e.target.value)}
                  placeholder="Custom message to include with the invoice..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowSendModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkSend}
                disabled={isSending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300 flex items-center"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Send Invoices
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkInvoiceResults;
