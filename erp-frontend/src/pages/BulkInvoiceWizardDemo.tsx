import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, ExternalLink } from 'lucide-react';
import BulkInvoiceWizard from '../components/incomes/BulkInvoiceWizard';
import { BulkInvoiceResult } from '../services/invoiceService';

const BulkInvoiceWizardDemo: React.FC = () => {
  const navigate = useNavigate();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [lastResult, setLastResult] = useState<BulkInvoiceResult | null>(null);
  const [lastResultId, setLastResultId] = useState<string | null>(null);

  const handleWizardComplete = (result: BulkInvoiceResult) => {
    setLastResult(result);
    console.log('Bulk invoice creation completed:', result);

    // Store result in sessionStorage for URL access
    const resultId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem(`bulkInvoiceResult_${resultId}`, JSON.stringify(result));
    setLastResultId(resultId);

    // Optionally navigate to dedicated results page
    // navigate(`/bulk-invoice-results?resultId=${resultId}`);
  };

  const handleViewFullResults = () => {
    if (lastResultId) {
      navigate(`/bulk-invoice-results?resultId=${lastResultId}`);
    }
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <FileText className="w-8 h-8 text-blue-600 mr-3" />
                Bulk Invoice Wizard Demo
              </h1>
              <p className="text-gray-600 mt-2">
                Test the bulk invoice generation wizard component
              </p>
            </div>
            <button
              onClick={() => setIsWizardOpen(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              Open Bulk Invoice Wizard
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">How to Test</h2>
          <div className="space-y-3 text-gray-700">
            <div className="flex items-start">
              <span className="bg-blue-100 text-blue-800 text-sm font-medium px-2 py-1 rounded mr-3 mt-0.5">
                1
              </span>
              <div>
                <strong>Fee Structure Selection:</strong> Choose from available fee structures. The
                wizard will load active fee structures from the API.
              </div>
            </div>
            <div className="flex items-start">
              <span className="bg-blue-100 text-blue-800 text-sm font-medium px-2 py-1 rounded mr-3 mt-0.5">
                2
              </span>
              <div>
                <strong>Client Selection:</strong> Filter and select clients who will receive
                invoices. Use the search and filter options to find specific clients.
              </div>
            </div>
            <div className="flex items-start">
              <span className="bg-blue-100 text-blue-800 text-sm font-medium px-2 py-1 rounded mr-3 mt-0.5">
                3
              </span>
              <div>
                <strong>Preview & Confirm:</strong> Review the invoice preview, set dates, and
                configure options before creating the invoices.
              </div>
            </div>
            <div className="flex items-start">
              <span className="bg-blue-100 text-blue-800 text-sm font-medium px-2 py-1 rounded mr-3 mt-0.5">
                4
              </span>
              <div>
                <strong>Results:</strong> View the results of the bulk invoice creation, including
                success/failure counts and individual invoice details.
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Wizard Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">Multi-Step Interface</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Progressive step-by-step workflow</li>
                <li>• Visual progress indicators</li>
                <li>• Navigation between steps</li>
                <li>• Form validation at each step</li>
              </ul>
            </div>
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">Client Management</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Search and filter clients</li>
                <li>• Select all / deselect all</li>
                <li>• Individual client selection</li>
                <li>• Client status filtering</li>
              </ul>
            </div>
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">Invoice Configuration</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Fee structure selection</li>
                <li>• Custom invoice dates</li>
                <li>• Optional descriptions</li>
                <li>• Immediate sending option</li>
              </ul>
            </div>
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">Results & Feedback</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Detailed creation results</li>
                <li>• Success/failure counts</li>
                <li>• Individual invoice status</li>
                <li>• Error reporting</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Last Result */}
        {lastResult && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Last Wizard Result</h2>
              {lastResultId && (
                <button
                  onClick={handleViewFullResults}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Full Results Page
                </button>
              )}
            </div>
            <div
              className={`border rounded-lg p-4 ${
                lastResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <div
                    className={`text-sm font-medium ${
                      lastResult.success ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    Created Successfully
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      lastResult.success ? 'text-green-900' : 'text-red-900'
                    }`}
                  >
                    {lastResult.created_count}
                  </div>
                </div>
                <div>
                  <div
                    className={`text-sm font-medium ${
                      lastResult.success ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    Failed
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      lastResult.success ? 'text-green-900' : 'text-red-900'
                    }`}
                  >
                    {lastResult.failed_count}
                  </div>
                </div>
                <div>
                  <div
                    className={`text-sm font-medium ${
                      lastResult.success ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    Total Amount
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      lastResult.success ? 'text-green-900' : 'text-red-900'
                    }`}
                  >
                    {lastResult.total_amount
                      ? formatCurrency(lastResult.total_amount)
                      : formatCurrency(
                          (lastResult.created_invoices || lastResult.invoices || [])
                            .reduce((sum, inv) => sum + parseFloat(inv.amount), 0)
                            .toString()
                        )}
                  </div>
                </div>
              </div>

              {(lastResult.created_invoices || lastResult.invoices || []).length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Created Invoices</h4>
                  <div className="space-y-2">
                    {(lastResult.created_invoices || lastResult.invoices || [])
                      .slice(0, 5)
                      .map(invoice => (
                        <div key={invoice.id} className="flex items-center justify-between text-sm">
                          <span>
                            {invoice.invoice_number} - {invoice.client_name}
                          </span>
                          <span className="font-medium">{formatCurrency(invoice.amount)}</span>
                        </div>
                      ))}
                    {(lastResult.created_invoices || lastResult.invoices || []).length > 5 && (
                      <div className="text-sm text-gray-500">
                        ... and{' '}
                        {(lastResult.created_invoices || lastResult.invoices || []).length - 5} more
                        invoices
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(lastResult.errors || []).length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium text-red-900 mb-2">Errors</h4>
                  <ul className="text-sm text-red-800 space-y-1">
                    {(lastResult.errors || []).map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bulk Invoice Wizard */}
      <BulkInvoiceWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onComplete={handleWizardComplete}
      />
    </div>
  );
};

export default BulkInvoiceWizardDemo;
