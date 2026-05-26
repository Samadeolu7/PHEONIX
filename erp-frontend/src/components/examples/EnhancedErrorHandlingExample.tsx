// src/components/examples/EnhancedErrorHandlingExample.tsx
import React, { useState } from 'react';
import { useAsyncOperation, useFormSubmission } from '../../hooks/useAsyncOperation';
import { useLoadingState, useButtonState } from '../../hooks/useLoadingState';
import EnhancedButton from '../ui/EnhancedButton';
import LoadingOverlay from '../ui/LoadingOverlay';
import ErrorDisplay from '../error/ErrorDisplay';
import ErrorBoundary from '../error/ErrorBoundary';
import { useSubmitRequisition, useCreateStockAdjustment } from '../../hooks/useProcurement';
import { CheckCircle, AlertCircle, Package, Send } from 'lucide-react';

// Mock operations for demonstration
const mockOperations = {
  // Simulates a successful operation
  successOperation: async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { success: true, message: 'Operation completed successfully!' };
  },

  // Simulates a network error
  networkErrorOperation: async () => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    throw new Error('Network connection failed');
  },

  // Simulates a validation error
  validationErrorOperation: async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const error = new Error('Validation failed');
    (error as any).response = {
      status: 400,
      data: { message: 'Required fields are missing' },
    };
    throw error;
  },

  // Simulates a server error (retryable)
  serverErrorOperation: async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const error = new Error('Internal server error');
    (error as any).response = {
      status: 500,
      data: { message: 'Internal server error occurred' },
    };
    throw error;
  },
};

export const EnhancedErrorHandlingExample: React.FC = () => {
  const [selectedOperation, setSelectedOperation] = useState<string>('success');
  const [formData, setFormData] = useState({ name: '', email: '' });

  // Global loading state
  const { isAnyLoading, loadingOperations } = useLoadingState();

  // Example 1: Basic async operation with enhanced error handling
  const basicOperation = useAsyncOperation(
    mockOperations[selectedOperation as keyof typeof mockOperations],
    'example-operation',
    {
      showSuccessToast: true,
      successMessage: 'Operation completed successfully!',
      operationId: 'basic-operation',
      disableButtons: ['basic-op-btn', 'form-submit-btn'],
      showRetryButton: true,
      autoRetryOnNetworkError: true,
    }
  );

  // Example 2: Form submission with enhanced error handling
  const formSubmission = useFormSubmission(
    async (data: typeof formData) => {
      if (!data.name || !data.email) {
        const error = new Error('Validation failed');
        (error as any).response = {
          status: 400,
          data: { message: 'Name and email are required' },
        };
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { success: true, data };
    },
    'form-submission',
    {
      showSuccessToast: true,
      successMessage: 'Form submitted successfully!',
      operationId: 'form-submission',
      disableButtons: ['form-submit-btn', 'basic-op-btn'],
      resetFormOnSuccess: true,
      resetForm: () => setFormData({ name: '', email: '' }),
    }
  );

  // Example 3: Real procurement operation
  const submitRequisition = useSubmitRequisition();

  return (
    <ErrorBoundary>
      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
          Enhanced Error Handling Examples
        </h1>

        {/* Global Loading Indicator */}
        {isAnyLoading && (
          <div
            style={{
              position: 'fixed',
              top: '16px',
              right: '16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '14px',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              className="error-spinner"
              style={{
                width: '16px',
                height: '16px',
                border: '2px solid transparent',
                borderTop: '2px solid white',
                borderRadius: '50%',
              }}
            />
            {loadingOperations.length} operation{loadingOperations.length !== 1 ? 's' : ''} running
          </div>
        )}

        {/* Example 1: Basic Operation */}
        <div
          style={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            Example 1: Basic Async Operation
          </h2>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              Select Operation Type:
            </label>
            <select
              value={selectedOperation}
              onChange={e => setSelectedOperation(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            >
              <option value="successOperation">Success Operation</option>
              <option value="networkErrorOperation">Network Error</option>
              <option value="validationErrorOperation">Validation Error</option>
              <option value="serverErrorOperation">Server Error (Retryable)</option>
            </select>
          </div>

          <EnhancedButton
            buttonId="basic-op-btn"
            variant="primary"
            onClick={() => basicOperation.execute()}
            icon={<Send size={16} />}
            loadingText="Processing..."
          >
            Execute Operation
          </EnhancedButton>

          {basicOperation.error && (
            <div style={{ marginTop: '16px' }}>
              <ErrorDisplay
                error={basicOperation.error}
                context="example-operation"
                onRetry={() => basicOperation.execute()}
                variant="card"
              />
            </div>
          )}

          {basicOperation.isSuccess && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle size={16} />
              Operation completed successfully!
            </div>
          )}
        </div>

        {/* Example 2: Form Submission */}
        <div
          style={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            Example 2: Form Submission with Validation
          </h2>

          <div style={{ display: 'grid', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                Email *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
                placeholder="Enter your email"
              />
            </div>
          </div>

          <EnhancedButton
            buttonId="form-submit-btn"
            variant="success"
            onClick={() => formSubmission.submit(formData)}
            icon={<CheckCircle size={16} />}
            loadingText="Submitting..."
          >
            Submit Form
          </EnhancedButton>

          {formSubmission.error && (
            <div style={{ marginTop: '16px' }}>
              <ErrorDisplay
                error={formSubmission.error}
                context="form-submission"
                onRetry={() => formSubmission.submit(formData)}
                variant="card"
              />
            </div>
          )}
        </div>

        {/* Example 3: Loading Overlay */}
        <div
          style={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
            position: 'relative',
            minHeight: '200px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            Example 3: Loading Overlay
          </h2>

          <p style={{ marginBottom: '16px', color: '#6b7280' }}>
            This section demonstrates loading overlays that appear during operations.
          </p>

          <EnhancedButton
            buttonId="overlay-btn"
            variant="primary"
            onClick={() => basicOperation.execute()}
            icon={<Package size={16} />}
          >
            Trigger Loading Overlay
          </EnhancedButton>

          <LoadingOverlay operationId="basic-operation" message="Processing your request..." />
        </div>

        {/* Example 4: Error Types */}
        <div
          style={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            Example 4: Different Error Display Variants
          </h2>

          <div style={{ display: 'grid', gap: '16px' }}>
            <ErrorDisplay error="This is an inline error message" variant="inline" size="sm" />

            <ErrorDisplay
              error={{
                message: 'Network connection failed',
                code: 'NETWORK',
                retryable: true,
                userFriendly: true,
              }}
              variant="card"
              onRetry={() => console.log('Retry clicked')}
            />

            <ErrorDisplay
              error={{
                message: 'Validation failed: Required fields are missing',
                code: 'VALIDATION',
                retryable: false,
                userFriendly: true,
              }}
              variant="banner"
              showDismiss
              onDismiss={() => console.log('Dismiss clicked')}
            />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default EnhancedErrorHandlingExample;
