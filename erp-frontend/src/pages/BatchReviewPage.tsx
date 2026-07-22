import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Download,
  FileText,
  CheckCircle,
  AlertTriangle,
  Eye,
  ArrowLeft,
  Users,
  DollarSign,
  Calendar,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { invoiceService, Invoice } from '../services/invoiceService';
import { useBatchReviewSample } from '../hooks/useInvoices';

interface BatchSampleData {
  batch_id: string;
  total_invoices: number;
  sample_size: number;
  sample_invoices: Invoice[];
  discrepancies: {
    invoice_id: number;
    issue_type: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
  }[];
}

const BatchReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { success, error: showError } = useToast();

  const batchId = searchParams.get('batch_id') || '';

  const [downloadingReport, setDownloadingReport] = useState(false);
  const [samplePercent, setSamplePercent] = useState(5);
  const [showAllInvoices, setShowAllInvoices] = useState(false);

  const { data: batchData, isLoading: loading, refetch: refetchBatch } = useBatchReviewSample(
    batchId,
    samplePercent,
    !!batchId
  );

  if (!batchId) {
    if (!loading) {
      showError('No batch ID provided');
      navigate('/incomes/invoices');
    }
    return null;
  }

  const handleDownloadReport = async () => {
    if (!batchId) return;

    try {
      setDownloadingReport(true);
      const blob = await invoiceService.downloadBatchApprovalReport(batchId);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `batch-approval-report-${batchId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      success('Report downloaded successfully');
    } catch (error) {
      console.error('Error downloading report:', error);
      showError('Failed to download approval report');
    } finally {
      setDownloadingReport(false);
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

  const getSeverityBadge = (severity: 'high' | 'medium' | 'low') => {
    const config = {
      high: { color: 'bg-red-100 text-red-800', label: 'High' },
      medium: { color: 'bg-yellow-100 text-yellow-800', label: 'Medium' },
      low: { color: 'bg-blue-100 text-blue-800', label: 'Low' },
    };
    const { color, label } = config[severity];
    return (
      <span
        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${color}`}
      >
        {label}
      </span>
    );
  };

  const displayedInvoices = showAllInvoices
    ? batchData?.sample_invoices || []
    : (batchData?.sample_invoices || []).slice(0, 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!batchData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Batch Not Found</h2>
          <p className="text-gray-600 mb-4">The requested batch could not be found.</p>
          <button
            onClick={() => navigate('/incomes/invoices')}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Back to Invoices
          </button>
        </div>
      </div>
    );
  }

  const hasDiscrepancies = batchData.discrepancies.length > 0;
  const highSeverityCount = batchData.discrepancies.filter(d => d.severity === 'high').length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/incomes/invoices')}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <Shield className="h-6 w-6 mr-2 text-blue-600" />
                Batch Review & Approval
              </h1>
              <p className="text-gray-600">Batch ID: {batchId}</p>
            </div>
          </div>
          <button
            onClick={handleDownloadReport}
            disabled={downloadingReport}
            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {downloadingReport ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                Downloading...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download Approval Report
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Invoices</p>
              <p className="text-2xl font-bold text-gray-900">{batchData.total_invoices}</p>
            </div>
            <FileText className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Sample Size</p>
              <p className="text-2xl font-bold text-gray-900">
                {batchData.sample_size} ({samplePercent}%)
              </p>
            </div>
            <Eye className="h-8 w-8 text-purple-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Discrepancies</p>
              <p
                className={`text-2xl font-bold ${hasDiscrepancies ? 'text-red-600' : 'text-green-600'}`}
              >
                {batchData.discrepancies.length}
              </p>
            </div>
            {hasDiscrepancies ? (
              <AlertTriangle className="h-8 w-8 text-red-600" />
            ) : (
              <CheckCircle className="h-8 w-8 text-green-600" />
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Status</p>
              <p
                className={`text-lg font-bold ${hasDiscrepancies ? 'text-yellow-600' : 'text-green-600'}`}
              >
                {hasDiscrepancies ? 'Needs Review' : 'Ready'}
              </p>
            </div>
            <Shield
              className={`h-8 w-8 ${hasDiscrepancies ? 'text-yellow-600' : 'text-green-600'}`}
            />
          </div>
        </div>
      </div>

      {/* Discrepancies Alert */}
      {hasDiscrepancies && (
        <div
          className={`rounded-lg p-6 ${highSeverityCount > 0 ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}
        >
          <div className="flex items-start">
            <AlertTriangle
              className={`h-6 w-6 mr-3 ${highSeverityCount > 0 ? 'text-red-600' : 'text-yellow-600'}`}
            />
            <div className="flex-1">
              <h3
                className={`text-lg font-semibold mb-2 ${highSeverityCount > 0 ? 'text-red-900' : 'text-yellow-900'}`}
              >
                {highSeverityCount > 0 ? 'Critical Issues Found' : 'Issues Found in Sample'}
              </h3>
              <p
                className={`text-sm mb-4 ${highSeverityCount > 0 ? 'text-red-800' : 'text-yellow-800'}`}
              >
                {batchData.discrepancies.length} discrepancy/discrepancies detected in the sample
                batch.
                {highSeverityCount > 0 && ` ${highSeverityCount} are marked as high severity.`}
              </p>
              <div className="space-y-2">
                {batchData.discrepancies.map((discrepancy, index) => (
                  <div key={index} className="bg-white rounded-md p-3 shadow-sm">
                    <div className="flex items-start justify-between mb-1">
                      <span className="font-medium text-gray-900">
                        Invoice #{discrepancy.invoice_id}
                      </span>
                      {getSeverityBadge(discrepancy.severity)}
                    </div>
                    <p className="text-sm text-gray-700">
                      <strong>{discrepancy.issue_type}:</strong> {discrepancy.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sample Controls */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">Sample Size:</label>
            <select
              value={samplePercent}
              onChange={e => setSamplePercent(parseInt(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={5}>5%</option>
              <option value={10}>10%</option>
              <option value={20}>20%</option>
              <option value={50}>50%</option>
            </select>
            <button
              onClick={() => refetchBatch()}
              className="flex items-center px-3 py-1 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh Sample
            </button>
          </div>
        </div>
      </div>

      {/* Sample Invoices */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Sample Invoices</h3>
          <p className="text-sm text-gray-600">
            Showing {displayedInvoices.length} of {batchData.sample_invoices.length} sample invoices
          </p>
        </div>
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
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Due Date
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
              {displayedInvoices.map(invoice => {
                const hasIssue = batchData.discrepancies.some(d => d.invoice_id === invoice.id);
                return (
                  <tr key={invoice.id} className={hasIssue ? 'bg-red-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {hasIssue && <AlertTriangle className="h-4 w-4 text-red-600 mr-2" />}
                        <span className="text-sm font-medium text-gray-900">
                          {invoice.invoice_number}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {invoice.client_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(invoice.due_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          invoice.status === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : invoice.status === 'sent'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => navigate(`/incomes/invoices/${invoice.id}/view`)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {batchData.sample_invoices.length > 10 && !showAllInvoices && (
          <div className="px-6 py-4 border-t border-gray-200 text-center">
            <button
              onClick={() => setShowAllInvoices(true)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Show all {batchData.sample_invoices.length} invoices
            </button>
          </div>
        )}
      </div>

      {/* Sign-off Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Batch Sign-off</h3>
        {hasDiscrepancies ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <p className="text-sm text-yellow-800">
              <strong>Warning:</strong> This batch has {batchData.discrepancies.length}{' '}
              discrepancies. Please review and resolve all issues before proceeding with
              distribution.
            </p>
            <div className="mt-4 flex space-x-3">
              <button
                onClick={handleDownloadReport}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Download Full Report
              </button>
              <button
                onClick={() => navigate('/incomes/invoices')}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Return to Invoices
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex items-start">
              <CheckCircle className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-green-800 mb-4">
                  <strong>No discrepancies found.</strong> This batch has been reviewed and is ready
                  for distribution.
                </p>
                <div className="flex space-x-3">
                  <button
                    onClick={handleDownloadReport}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4 inline mr-2" />
                    Download Approval Report
                  </button>
                  <button
                    onClick={() => {
                      success('Batch approved for distribution');
                      navigate('/incomes/invoices');
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                  >
                    <CheckCircle className="h-4 w-4 inline mr-2" />
                    Sign-off & Approve Batch
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchReviewPage;
