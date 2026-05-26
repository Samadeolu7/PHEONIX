// src/components/examples/RequisitionErrorHandlingExample.tsx
import React, { useState } from 'react';
import {
  RequisitionErrorHandler,
  SubmissionType,
  RequisitionError,
} from '../../utils/RequisitionErrorHandler';
import { CreatePurchaseRequisitionData, WorkflowRequisitionData } from '../../types/procurement';

/**
 * Example component demonstrating how to use RequisitionErrorHandler
 * in a dual workflow requisition form
 */
export const RequisitionErrorHandlingExample: React.FC = () => {
  const [loading, setLoading] = useState<Record<SubmissionType, boolean>>({
    draft: false,
    manual: false,
    workflow: false,
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [alternativeSuggestion, setAlternativeSuggestion] = useState<{
    type: SubmissionType;
    message: string;
  } | null>(null);

  // Mock form data
  const mockFormData = {
    requested_by: 1,
    department: 'IT Department',
    required_by_date: '2026-02-15',
    purpose: 'Office equipment for new employees',
    notes: 'Urgent requirement',
    items: [
      {
        item: 1,
        description: 'Laptop computer',
        quantity: '10',
        estimated_unit_price: '50.00',
        notes: 'Dell or HP preferred',
      },
    ],
  };

  // Mock API calls that can fail
  const mockCreateRequisition = async (data: CreatePurchaseRequisitionData) => {
    // Simulate random failures for demonstration
    const random = Math.random();
    if (random < 0.3) {
      throw new Error('HTTP 500: Server error');
    }
    if (random < 0.5) {
      throw new Error('HTTP 400: Validation failed');
    }
    return { id: 1, pr_number: 'PR-2026-001', status: data.status || 'draft' };
  };

  const mockCreateWithWorkflow = async (data: WorkflowRequisitionData) => {
    // Simulate workflow-specific failures
    const random = Math.random();
    if (random < 0.4) {
      throw { response: { status: 503, data: { message: 'Workflow system unavailable' } } };
    }
    if (random < 0.6) {
      throw { response: { status: 500, data: { message: 'Workflow configuration error' } } };
    }
    return { pr_id: 1, pr_number: 'PR-2026-001', workflow_run_id: 456, status: 'submitted' };
  };

  const mockConvertToPO = async (id: number, conversionData: any) => {
    const random = Math.random();
    if (random < 0.3) {
      throw { response: { status: 409, data: { message: 'Requisition already converted' } } };
    }
    return { id: 1, po_number: 'PO-2026-001', status: 'draft' };
  };

  // Handle submission with error handling
  const handleSubmission = async (submissionType: SubmissionType) => {
    setLoading(prev => ({ ...prev, [submissionType]: true }));
    setError(null);
    setSuccess(null);
    setAlternativeSuggestion(null);

    try {
      let result;

      if (submissionType === 'draft') {
        result = await RequisitionErrorHandler.withRetry(
          () => mockCreateRequisition({ ...mockFormData, status: 'draft' }),
          'draft',
          'save draft'
        );
        setSuccess(`Draft saved successfully: ${result.pr_number}`);
      } else if (submissionType === 'manual') {
        result = await RequisitionErrorHandler.withRetry(
          () => mockCreateRequisition({ ...mockFormData, status: 'submitted' }),
          'manual',
          'submit for approval'
        );
        setSuccess(`Requisition submitted for approval: ${result.pr_number}`);
      } else if (submissionType === 'workflow') {
        result = await RequisitionErrorHandler.withRetry(
          () =>
            mockCreateWithWorkflow({
              department: mockFormData.department,
              purpose: mockFormData.purpose,
              required_by_date: mockFormData.required_by_date,
              items: mockFormData.items.map(item => ({
                item: item.item,
                quantity: parseInt(item.quantity),
                estimated_unit_price: item.estimated_unit_price,
              })),
            }),
          'workflow',
          'create with workflow'
        );
        setSuccess(
          `Workflow requisition created: ${result.pr_number} (Workflow ID: ${result.workflow_run_id})`
        );
      }
    } catch (error) {
      const errorResult = RequisitionErrorHandler.handleSubmissionError(
        error,
        submissionType,
        RequisitionErrorHandler.getActionLabel(submissionType)
      );

      setError(errorResult.userMessage);

      if (errorResult.canRetryWithAlternative && errorResult.suggestedAlternative) {
        setAlternativeSuggestion({
          type: errorResult.suggestedAlternative,
          message:
            errorResult.alternativeMessage ||
            `Try ${RequisitionErrorHandler.getActionLabel(errorResult.suggestedAlternative)} instead`,
        });
      }

      // Log error for debugging
      RequisitionErrorHandler.logError(errorResult.error, `${submissionType} submission`);
    } finally {
      setLoading(prev => ({ ...prev, [submissionType]: false }));
    }
  };

  // Handle conversion with error handling
  const handleConversion = async () => {
    setError(null);
    setSuccess(null);

    try {
      const result = await RequisitionErrorHandler.withRetry(
        () =>
          mockConvertToPO(1, {
            supplier: 1,
            delivery_location: 1,
            expected_delivery_date: '2026-02-20',
          }),
        'manual',
        'convert to purchase order'
      );
      setSuccess(`Successfully converted to PO: ${result.po_number}`);
    } catch (error) {
      const errorResult = RequisitionErrorHandler.handleConversionError(error, 1);
      setError(errorResult.userMessage);

      RequisitionErrorHandler.logError(errorResult.error, 'conversion to PO');
    }
  };

  // Handle alternative suggestion
  const handleAlternativeSubmission = () => {
    if (alternativeSuggestion) {
      handleSubmission(alternativeSuggestion.type);
      setAlternativeSuggestion(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Requisition Error Handling Example</h2>

      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h3 className="text-lg font-semibold mb-2">Mock Form Data</h3>
        <pre className="text-sm bg-white p-3 rounded border overflow-x-auto">
          {JSON.stringify(mockFormData, null, 2)}
        </pre>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => handleSubmission('draft')}
          disabled={loading.draft}
          className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 text-white px-4 py-2 rounded transition-colors"
        >
          {loading.draft ? 'Saving...' : 'Save as Draft'}
        </button>

        <button
          onClick={() => handleSubmission('manual')}
          disabled={loading.manual}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded transition-colors"
        >
          {loading.manual ? 'Submitting...' : 'Submit for Approval'}
        </button>

        <button
          onClick={() => handleSubmission('workflow')}
          disabled={loading.workflow}
          className="bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white px-4 py-2 rounded transition-colors"
        >
          {loading.workflow ? 'Creating...' : 'Create with Workflow'}
        </button>
      </div>

      <div className="mb-6">
        <button
          onClick={handleConversion}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded transition-colors"
        >
          Convert to Purchase Order
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {alternativeSuggestion && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-yellow-800">Alternative Suggestion</h3>
              <p className="mt-1 text-sm text-yellow-700">{alternativeSuggestion.message}</p>
              <div className="mt-3">
                <button
                  onClick={handleAlternativeSubmission}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm transition-colors"
                >
                  Try {RequisitionErrorHandler.getActionLabel(alternativeSuggestion.type)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">Success</h3>
              <p className="mt-1 text-sm text-green-700">{success}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">How it works:</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Each button simulates different failure scenarios randomly</li>
          <li>• The error handler classifies errors and provides user-friendly messages</li>
          <li>• When workflow fails, it suggests manual approval as alternative</li>
          <li>• When manual approval fails, it suggests saving as draft</li>
          <li>• Retryable errors (network, server) are automatically retried with backoff</li>
          <li>• Non-retryable errors (validation, permission) fail immediately</li>
        </ul>
      </div>
    </div>
  );
};

export default RequisitionErrorHandlingExample;
