// src/components/ui/GlobalProgressOverlay.tsx
import React, { useState } from 'react';
import { X, ChevronUp, ChevronDown, Activity } from 'lucide-react';
import { useReceivablesError } from '../../hooks/useReceivablesError';
import ProgressIndicator from './ProgressIndicator';

interface GlobalProgressOverlayProps {
  position?: 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left';
  maxVisible?: number;
}

const GlobalProgressOverlay: React.FC<GlobalProgressOverlayProps> = ({
  position = 'bottom-right',
  maxVisible = 3,
}) => {
  const { activeOperations, operations } = useReceivablesError({ trackProgress: true });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Don't render if no operations
  if (operations.length === 0) {
    return null;
  }

  const getPositionClasses = () => {
    switch (position) {
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'top-left':
        return 'top-4 left-4';
      case 'bottom-right':
      default:
        return 'bottom-4 right-4';
    }
  };

  const visibleOperations = isExpanded ? operations : operations.slice(0, maxVisible);
  const hasMore = operations.length > maxVisible;

  if (isMinimized) {
    return (
      <div className={`fixed ${getPositionClasses()} z-50`}>
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-blue-600 text-white rounded-full p-3 shadow-lg hover:bg-blue-700 transition-colors"
          title={`${activeOperations.length} operations in progress`}
        >
          <Activity className="h-5 w-5" />
          {activeOperations.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {activeOperations.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={`fixed ${getPositionClasses()} z-50 max-w-sm w-full`}>
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-gray-600" />
              <h3 className="text-sm font-medium text-gray-900">
                Operations ({operations.length})
              </h3>
              {activeOperations.length > 0 && (
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                  {activeOperations.length} active
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1">
              {hasMore && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                  title={isExpanded ? 'Show less' : 'Show all'}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              )}
              <button
                onClick={() => setIsMinimized(true)}
                className="text-gray-400 hover:text-gray-600 p-1"
                title="Minimize"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Operations List */}
        <div className="max-h-96 overflow-y-auto">
          <div className="p-2 space-y-2">
            {visibleOperations.map(operation => (
              <ProgressIndicator
                key={operation.operationId}
                operation={operation}
                compact={true}
                showDetails={false}
              />
            ))}
          </div>

          {hasMore && !isExpanded && (
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
              <button
                onClick={() => setIsExpanded(true)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Show {operations.length - maxVisible} more operations
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalProgressOverlay;
