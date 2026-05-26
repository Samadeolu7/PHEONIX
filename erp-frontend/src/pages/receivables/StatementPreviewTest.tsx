// src/pages/receivables/StatementPreviewTest.tsx
import React, { useState } from 'react';
import { FileText, Calendar, User } from 'lucide-react';
import StatementPreview from '../../components/receivables/StatementPreview';
import { StatementPreview as StatementPreviewType } from '../../types/statements';
import { receivablesService } from '../../services/receivablesService';

const StatementPreviewTest: React.FC = () => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<StatementPreviewType | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    client: 1,
    period_start: '2025-01-01',
    period_end: '2025-01-31',
    include_paid: false,
  });

  const handleGeneratePreview = async () => {
    try {
      setLoading(true);
      const preview = await receivablesService.getStatementPreview(formData);
      setPreviewData(preview);
      setShowPreview(true);
    } catch (error) {
      console.error('Failed to generate preview:', error);
      alert('Failed to generate statement preview');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSent = () => {
    alert('Statement sent successfully!');
    setShowPreview(false);
  };

  const handleDownload = () => {
    alert('Statement downloaded successfully!');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <FileText className="h-8 w-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-900">Statement Preview Test</h1>
          </div>
          <p className="text-gray-600">
            Test the StatementPreview component with different parameters.
          </p>
        </div>

        {/* Form */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Generate Statement Preview</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="h-4 w-4 inline mr-1" />
                Client ID
              </label>
              <input
                type="number"
                value={formData.client}
                onChange={e => setFormData({ ...formData, client: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                min="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="h-4 w-4 inline mr-1" />
                Period Start
              </label>
              <input
                type="date"
                value={formData.period_start}
                onChange={e => setFormData({ ...formData, period_start: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="h-4 w-4 inline mr-1" />
                Period End
              </label>
              <input
                type="date"
                value={formData.period_end}
                onChange={e => setFormData({ ...formData, period_end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="include_paid"
                checked={formData.include_paid}
                onChange={e => setFormData({ ...formData, include_paid: e.target.checked })}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="include_paid" className="ml-2 block text-sm text-gray-700">
                Include paid transactions
              </label>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleGeneratePreview}
              disabled={loading}
              className="w-full md:w-auto px-6 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Generating Preview...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Statement Preview
                </>
              )}
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">Component Features</h3>
          <div className="space-y-2 text-blue-800">
            <p>
              • <strong>Statement Preview:</strong> Shows transaction details and balances in a
              professional format
            </p>
            <p>
              • <strong>PDF Generation:</strong> Download statement as a text file (PDF would be
              implemented with proper backend)
            </p>
            <p>
              • <strong>Email Composition:</strong> Send statement via email with customizable
              subject and message
            </p>
            <p>
              • <strong>Print Support:</strong> Print-friendly layout for physical statements
            </p>
            <p>
              • <strong>Responsive Design:</strong> Works on desktop and mobile devices
            </p>
            <p>
              • <strong>Error Handling:</strong> Graceful error handling with retry options
            </p>
          </div>
        </div>

        {/* Test Cases */}
        <div className="mt-8 bg-gray-100 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Test Cases</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => {
                setFormData({
                  client: 1,
                  period_start: '2025-01-01',
                  period_end: '2025-01-31',
                  include_paid: false,
                });
                handleGeneratePreview();
              }}
              className="p-3 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-left"
            >
              <div className="font-medium text-gray-900">Current Month</div>
              <div className="text-sm text-gray-600">January 2025 statement</div>
            </button>

            <button
              onClick={() => {
                setFormData({
                  client: 2,
                  period_start: '2024-12-01',
                  period_end: '2024-12-31',
                  include_paid: true,
                });
                handleGeneratePreview();
              }}
              className="p-3 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-left"
            >
              <div className="font-medium text-gray-900">Previous Month</div>
              <div className="text-sm text-gray-600">December 2024 with paid</div>
            </button>

            <button
              onClick={() => {
                setFormData({
                  client: 3,
                  period_start: '2025-01-01',
                  period_end: '2025-03-31',
                  include_paid: false,
                });
                handleGeneratePreview();
              }}
              className="p-3 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-left"
            >
              <div className="font-medium text-gray-900">Quarterly</div>
              <div className="text-sm text-gray-600">Q1 2025 statement</div>
            </button>
          </div>
        </div>
      </div>

      {/* Statement Preview Modal */}
      {showPreview && previewData && (
        <StatementPreview
          previewData={previewData}
          onClose={() => setShowPreview(false)}
          onEmailSent={handleEmailSent}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
};

export default StatementPreviewTest;
