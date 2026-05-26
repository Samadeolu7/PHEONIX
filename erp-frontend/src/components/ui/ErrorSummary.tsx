import React from 'react';
import { AlertTriangle, X, RefreshCw } from 'lucide-react';

interface ErrorSummaryProps {
  errors: string[];
  title?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
  variant?: 'error' | 'warning' | 'info';
  showRetry?: boolean;
}

const ErrorSummary: React.FC<ErrorSummaryProps> = ({
  errors,
  title = 'Please fix the following errors:',
  onDismiss,
  onRetry,
  className = '',
  variant = 'error',
  showRetry = false,
}) => {
  if (!errors || errors.length === 0) {
    return null;
  }

  const getVariantStyles = () => {
    switch (variant) {
      case 'warning':
        return {
          background: '#fef3c7',
          border: '#f59e0b',
          text: '#92400e',
          icon: '#f59e0b',
        };
      case 'info':
        return {
          background: '#dbeafe',
          border: '#3b82f6',
          text: '#1e40af',
          icon: '#3b82f6',
        };
      default:
        return {
          background: '#fef2f2',
          border: '#ef4444',
          text: '#991b1b',
          icon: '#ef4444',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div
      className={`error-summary ${className}`}
      style={{
        background: styles.background,
        border: `2px solid ${styles.border}`,
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '20px',
        position: 'relative',
      }}
      role="alert"
      aria-live="polite"
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          marginBottom: errors.length > 1 ? '12px' : '0',
        }}
      >
        <AlertTriangle
          size={20}
          style={{
            color: styles.icon,
            marginTop: '2px',
            flexShrink: 0,
          }}
        />

        <div style={{ flex: 1 }}>
          <h4
            style={{
              margin: '0 0 8px 0',
              fontSize: '14px',
              fontWeight: 600,
              color: styles.text,
            }}
          >
            {title}
          </h4>

          {errors.length === 1 ? (
            <p
              style={{
                margin: 0,
                fontSize: '14px',
                color: styles.text,
                lineHeight: '1.4',
              }}
            >
              {errors[0]}
            </p>
          ) : (
            <ul
              style={{
                margin: 0,
                paddingLeft: '16px',
                fontSize: '14px',
                color: styles.text,
                lineHeight: '1.4',
              }}
            >
              {errors.map((error, index) => (
                <li key={index} style={{ marginBottom: '4px' }}>
                  {error}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {showRetry && onRetry && (
            <button
              onClick={onRetry}
              style={{
                padding: '6px',
                border: 'none',
                background: 'rgba(255, 255, 255, 0.8)',
                borderRadius: '4px',
                cursor: 'pointer',
                color: styles.text,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Retry"
            >
              <RefreshCw size={14} />
            </button>
          )}

          {onDismiss && (
            <button
              onClick={onDismiss}
              style={{
                padding: '6px',
                border: 'none',
                background: 'rgba(255, 255, 255, 0.8)',
                borderRadius: '4px',
                cursor: 'pointer',
                color: styles.text,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorSummary;
