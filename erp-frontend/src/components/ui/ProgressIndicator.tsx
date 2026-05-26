// src/components/ui/ProgressIndicator.tsx
import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Loader2, Clock } from 'lucide-react';
import { OperationProgress } from '../../utils/receivablesErrorHandler';

interface ProgressIndicatorProps {
  operation: OperationProgress;
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  operation,
  showDetails = true,
  compact = false,
  className = '',
}) => {
  const getStatusIcon = () => {
    switch (operation.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'in_progress':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-gray-400" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusColor = () => {
    switch (operation.status) {
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'in_progress':
        return 'bg-blue-500';
      case 'pending':
        return 'bg-gray-400';
      default:
        return 'bg-yellow-500';
    }
  };

  const formatDuration = () => {
    const start = new Date(operation.startTime);
    const end = operation.endTime ? new Date(operation.endTime) : new Date();
    const duration = Math.round((end.getTime() - start.getTime()) / 1000);

    if (duration < 60) {
      return `${duration}s`;
    } else if (duration < 3600) {
      return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    } else {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        {getStatusIcon()}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{operation.message}</div>
          {operation.status === 'in_progress' && (
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${getStatusColor()}`}
                style={{ width: `${operation.progress}%` }}
              />
            </div>
          )}
        </div>
        {operation.status === 'in_progress' && (
          <div className="text-xs text-gray-500">{operation.progress.toFixed(0)}%</div>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border shadow-sm p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <h4 className="text-sm font-medium text-gray-900">
            {operation.context.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </h4>
        </div>
        <div className="text-xs text-gray-500">{formatDuration()}</div>
      </div>

      {/* Progress Bar */}
      {operation.status === 'in_progress' && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-600">{operation.message}</span>
            <span className="text-xs text-gray-500">{operation.progress.toFixed(0)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${getStatusColor()}`}
              style={{ width: `${operation.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Status Message */}
      <div className="text-sm text-gray-600 mb-2">{operation.message}</div>

      {/* Details */}
      {showDetails && (
        <div className="space-y-2">
          {/* Item Progress */}
          {operation.totalItems && operation.processedItems !== undefined && (
            <div className="flex justify-between text-xs text-gray-500">
              <span>Items processed:</span>
              <span>
                {operation.processedItems} / {operation.totalItems}
              </span>
            </div>
          )}

          {/* Errors */}
          {operation.errors && operation.errors.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-red-600 mb-1">
                Errors ({operation.errors.length}):
              </div>
              <div className="max-h-20 overflow-y-auto">
                {operation.errors.slice(0, 3).map((error, index) => (
                  <div key={index} className="text-xs text-red-500 truncate">
                    • {error}
                  </div>
                ))}
                {operation.errors.length > 3 && (
                  <div className="text-xs text-red-400">
                    ... and {operation.errors.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex justify-between text-xs text-gray-400 pt-2 border-t">
            <span>Started: {new Date(operation.startTime).toLocaleTimeString()}</span>
            {operation.endTime && (
              <span>Ended: {new Date(operation.endTime).toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgressIndicator;
