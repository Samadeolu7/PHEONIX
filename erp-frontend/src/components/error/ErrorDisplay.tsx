// src/components/error/ErrorDisplay.tsx
import React from 'react';
import { AlertCircle, RefreshCw, Wifi, Shield, AlertTriangle, Clock, Server } from 'lucide-react';
import { ApiError, ErrorType, ErrorHandler } from '../../utils/errorHandler';

export interface ErrorDisplayProps {
  error: ApiError | Error | string | null;
  context?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  showRetry?: boolean;
  showDismiss?: boolean;
  variant?: 'inline' | 'card' | 'banner';
  size?: 'sm' | 'md' | 'lg';
}

const getErrorIcon = (errorType: string) => {
  switch (errorType) {
    case ErrorType.NETWORK:
      return Wifi;
    case ErrorType.AUTHENTICATION:
    case ErrorType.AUTHORIZATION:
      return Shield;
    case ErrorType.VALIDATION:
      return AlertTriangle;
    case ErrorType.TIMEOUT:
      return Clock;
    case ErrorType.SERVER:
      return Server;
    default:
      return AlertCircle;
  }
};

const getErrorColor = (errorType: string) => {
  switch (errorType) {
    case ErrorType.NETWORK:
      return '#f59e0b'; // amber
    case ErrorType.AUTHENTICATION:
    case ErrorType.AUTHORIZATION:
      return '#8b5cf6'; // purple
    case ErrorType.VALIDATION:
      return '#f59e0b'; // amber
    case ErrorType.TIMEOUT:
      return '#6b7280'; // gray
    case ErrorType.SERVER:
      return '#ef4444'; // red
    default:
      return '#ef4444'; // red
  }
};

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  context,
  onRetry,
  onDismiss,
  showRetry = true,
  showDismiss = false,
  variant = 'card',
  size = 'md',
}) => {
  if (!error) return null;

  // Classify the error
  const classifiedError =
    typeof error === 'string'
      ? { message: error, code: ErrorType.UNKNOWN, retryable: false, userFriendly: true }
      : error instanceof Error
        ? ErrorHandler.classifyError(error)
        : error;

  const userMessage = ErrorHandler.getUserFriendlyMessage(classifiedError, context);
  const Icon = getErrorIcon(classifiedError.code);
  const iconColor = getErrorColor(classifiedError.code);

  const sizeStyles = {
    sm: {
      padding: '12px',
      fontSize: '12px',
      iconSize: 16,
      borderRadius: '6px',
    },
    md: {
      padding: '16px',
      fontSize: '14px',
      iconSize: 20,
      borderRadius: '8px',
    },
    lg: {
      padding: '24px',
      fontSize: '16px',
      iconSize: 24,
      borderRadius: '12px',
    },
  };

  const currentSize = sizeStyles[size];

  const baseStyles = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: currentSize.padding,
    borderRadius: currentSize.borderRadius,
    fontSize: currentSize.fontSize,
  };

  const variantStyles = {
    inline: {
      ...baseStyles,
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      color: '#991b1b',
    },
    card: {
      ...baseStyles,
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      color: '#991b1b',
    },
    banner: {
      ...baseStyles,
      backgroundColor: '#fef2f2',
      borderLeft: '4px solid #ef4444',
      color: '#991b1b',
    },
  };

  return (
    <div style={variantStyles[variant]}>
      <Icon
        size={currentSize.iconSize}
        style={{ color: iconColor, flexShrink: 0, marginTop: '2px' }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: '500', marginBottom: '4px' }}>
          {classifiedError.code === ErrorType.UNKNOWN
            ? 'Error'
            : classifiedError.code.replace('_', ' ')}
        </div>

        <div style={{ color: '#7f1d1d', lineHeight: '1.4' }}>{userMessage}</div>

        {process.env.NODE_ENV === 'development' && classifiedError.details && (
          <details style={{ marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#6b7280' }}>
              Technical Details
            </summary>
            <pre
              style={{
                marginTop: '4px',
                fontSize: '11px',
                color: '#6b7280',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                backgroundColor: '#f9fafb',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #e5e7eb',
              }}
            >
              {JSON.stringify(classifiedError.details, null, 2)}
            </pre>
          </details>
        )}

        {(showRetry || showDismiss) && (
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginTop: '12px',
              flexWrap: 'wrap',
            }}
          >
            {showRetry && classifiedError.retryable && onRetry && (
              <button
                onClick={onRetry}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={12} />
                Retry
              </button>
            )}

            {showDismiss && onDismiss && (
              <button
                onClick={onDismiss}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorDisplay;
