// ErrorDisplay Component
// Provides user-friendly error messages and recovery options for financial reports

import React from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Wifi,
  Lock,
  Server,
  FileX,
  AlertCircle,
  XCircle,
} from 'lucide-react';

interface ErrorDisplayProps {
  error: string | null;
  onRetry?: () => void;
  type?: 'warning' | 'error' | 'info';
  className?: string;
  showRetry?: boolean;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  type = 'error',
  className = '',
  showRetry = true,
}) => {
  if (!error) return null;

  // Determine error type and appropriate icon/styling
  const getErrorDetails = (errorMessage: string) => {
    const lowerError = errorMessage.toLowerCase();

    if (lowerError.includes('network') || lowerError.includes('fetch')) {
      return {
        icon: Wifi,
        title: 'Network Error',
        description: 'Unable to connect to the server. Please check your internet connection.',
        color: 'red',
        suggestions: [
          'Check your internet connection',
          'Try refreshing the page',
          'Contact support if the problem persists',
        ],
      };
    }

    if (
      lowerError.includes('authentication') ||
      lowerError.includes('401') ||
      lowerError.includes('unauthorized')
    ) {
      return {
        icon: Lock,
        title: 'Authentication Error',
        description: 'Your session has expired. Please log in again.',
        color: 'yellow',
        suggestions: ['Log in again', 'Clear your browser cache', 'Contact your administrator'],
      };
    }

    if (
      lowerError.includes('403') ||
      lowerError.includes('forbidden') ||
      lowerError.includes('permission')
    ) {
      return {
        icon: Lock,
        title: 'Access Denied',
        description: 'You do not have permission to access this report.',
        color: 'red',
        suggestions: ['Contact your administrator for access', 'Verify your user permissions'],
      };
    }

    if (
      lowerError.includes('500') ||
      lowerError.includes('server') ||
      lowerError.includes('internal')
    ) {
      return {
        icon: Server,
        title: 'Server Error',
        description: 'The server encountered an error while processing your request.',
        color: 'red',
        suggestions: ['Try again in a few minutes', 'Contact support if the problem persists'],
      };
    }

    if (lowerError.includes('start_date') || lowerError.includes('required')) {
      return {
        icon: AlertCircle,
        title: 'Missing Required Information',
        description: 'Please provide all required fields to generate the report.',
        color: 'yellow',
        suggestions: [
          'Check that all required fields are filled',
          'Verify date formats are correct',
        ],
      };
    }

    if (lowerError.includes('export') || lowerError.includes('download')) {
      return {
        icon: FileX,
        title: 'Export Failed',
        description: 'Unable to export the report. Please try again.',
        color: 'red',
        suggestions: [
          'Try a different export format',
          'Check your browser download settings',
          'Try again in a few minutes',
        ],
      };
    }

    // Default error
    return {
      icon: AlertTriangle,
      title: 'Error',
      description: errorMessage,
      color: 'red',
      suggestions: ['Try refreshing the page', 'Contact support if the problem persists'],
    };
  };

  const errorDetails = getErrorDetails(error);
  const Icon = errorDetails.icon;

  // Color schemes
  const colorSchemes = {
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: 'text-red-600',
      title: 'text-red-800',
      description: 'text-red-700',
      button: 'bg-red-600 hover:bg-red-700 text-white',
    },
    yellow: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      icon: 'text-yellow-600',
      title: 'text-yellow-800',
      description: 'text-yellow-700',
      button: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    },
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      icon: 'text-blue-600',
      title: 'text-blue-800',
      description: 'text-blue-700',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
  };

  const colors = colorSchemes[errorDetails.color as keyof typeof colorSchemes] || colorSchemes.red;

  return (
    <div className={`${colors.bg} ${colors.border} border rounded-lg p-6 ${className}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <Icon className={`h-6 w-6 ${colors.icon}`} />
        </div>

        <div className="ml-4 flex-1">
          <h3 className={`text-lg font-semibold ${colors.title} mb-2`}>{errorDetails.title}</h3>

          <p className={`text-sm ${colors.description} mb-4`}>{errorDetails.description}</p>

          {/* Suggestions */}
          {errorDetails.suggestions.length > 0 && (
            <div className="mb-4">
              <p className={`text-sm font-medium ${colors.title} mb-2`}>What you can try:</p>
              <ul className={`text-sm ${colors.description} space-y-1`}>
                {errorDetails.suggestions.map((suggestion, index) => (
                  <li key={index} className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {showRetry && onRetry && (
              <button
                onClick={onRetry}
                className={`
                  flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors
                  ${colors.button}
                `}
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
            )}

            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Specific error components for common scenarios
export const NetworkError: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <ErrorDisplay error="Network error occurred" onRetry={onRetry} type="error" />
);

export const AuthenticationError: React.FC = () => (
  <ErrorDisplay error="Authentication failed" type="warning" showRetry={false} />
);

export const PermissionError: React.FC = () => (
  <ErrorDisplay
    error="You do not have permission to access this report"
    type="error"
    showRetry={false}
  />
);

export const ValidationError: React.FC<{ message: string; onRetry?: () => void }> = ({
  message,
  onRetry,
}) => <ErrorDisplay error={message} onRetry={onRetry} type="warning" />;

export const ExportError: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <ErrorDisplay error="Export failed" onRetry={onRetry} type="error" />
);

// Empty state component (when no data is available)
export const EmptyState: React.FC<{
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({
  title = 'No Data Available',
  description = 'There is no data to display for the selected criteria.',
  action,
  className = '',
}) => (
  <div className={`text-center py-12 ${className}`}>
    <FileX className="h-12 w-12 text-gray-400 mx-auto mb-4" />
    <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-600 mb-6">{description}</p>
    {action && <div>{action}</div>}
  </div>
);

export default ErrorDisplay;
