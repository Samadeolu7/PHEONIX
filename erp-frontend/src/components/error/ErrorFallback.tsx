import React from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

interface ErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
  title?: string;
  message?: string;
  showRetry?: boolean;
  showGoBack?: boolean;
  onGoBack?: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  resetError,
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  showRetry = true,
  showGoBack = false,
  onGoBack,
}) => {
  return (
    <div
      style={{
        minHeight: '300px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: '500px',
          width: '100%',
          background: 'white',
          border: '2px solid #fecaca',
          borderRadius: '12px',
          padding: '32px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            background: '#fef2f2',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <AlertTriangle size={32} style={{ color: '#ef4444' }} />
        </div>

        <h3
          style={{
            margin: '0 0 12px 0',
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#1f2937',
          }}
        >
          {title}
        </h3>

        <p
          style={{
            margin: '0 0 24px 0',
            color: '#6b7280',
            fontSize: '14px',
            lineHeight: '1.5',
          }}
        >
          {message}
        </p>

        {process.env.NODE_ENV === 'development' && error && (
          <details
            style={{
              marginBottom: '24px',
              padding: '12px',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              textAlign: 'left',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                fontWeight: 600,
                color: '#374151',
                fontSize: '12px',
              }}
            >
              Error Details
            </summary>
            <pre
              style={{
                fontSize: '11px',
                color: '#ef4444',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: '8px 0 0 0',
              }}
            >
              {error.toString()}
            </pre>
          </details>
        )}

        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          {showRetry && resetError && (
            <button
              onClick={resetError}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderRadius: '6px',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={14} />
              Try Again
            </button>
          )}

          {showGoBack && onGoBack && (
            <button
              onClick={onGoBack}
              style={{
                padding: '10px 20px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ArrowLeft size={14} />
              Go Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorFallback;
