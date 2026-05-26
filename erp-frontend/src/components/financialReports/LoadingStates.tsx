// LoadingStates Component
// Provides various loading states for financial reports

import React from 'react';
import { Loader2, BarChart3, TrendingUp, PieChart } from 'lucide-react';

interface LoadingStatesProps {
  type?: 'default' | 'table' | 'chart' | 'skeleton';
  message?: string;
  className?: string;
}

const LoadingStates: React.FC<LoadingStatesProps> = ({
  type = 'default',
  message = 'Loading report...',
  className = '',
}) => {
  // Default spinner loading
  if (type === 'default') {
    return (
      <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-600 text-sm">{message}</p>
      </div>
    );
  }

  // Table skeleton loading
  if (type === 'table') {
    return (
      <div
        className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${className}`}
      >
        {/* Header skeleton */}
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <div className="grid grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        </div>

        {/* Rows skeleton */}
        <div className="divide-y divide-gray-200">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <div className="grid grid-cols-5 gap-4">
                <div className="h-4 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 bg-gray-100 rounded animate-pulse col-span-2" />
                <div className="h-4 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* Footer skeleton */}
        <div className="bg-gray-50 px-4 py-3 border-t-2 border-gray-300">
          <div className="grid grid-cols-5 gap-4">
            <div className="h-4 bg-gray-200 rounded animate-pulse col-span-3" />
            <div className="h-4 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Chart loading
  if (type === 'chart') {
    return (
      <div
        className={`flex flex-col items-center justify-center py-16 bg-gray-50 rounded-lg ${className}`}
      >
        <div className="relative">
          <BarChart3 className="h-16 w-16 text-gray-300" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        </div>
        <p className="text-gray-600 text-sm mt-4">{message}</p>
      </div>
    );
  }

  // Skeleton loading for report sections
  if (type === 'skeleton') {
    return (
      <div className={`space-y-6 ${className}`}>
        {/* Header skeleton */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="h-6 bg-gray-200 rounded w-48 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-32 animate-pulse" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-4 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>

        {/* Content sections skeleton */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="h-5 bg-gray-200 rounded w-40 mb-4 animate-pulse" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex justify-between items-center">
                  <div className="h-4 bg-gray-100 rounded w-64 animate-pulse" />
                  <div className="h-4 bg-gray-100 rounded w-24 animate-pulse" />
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 mt-4 pt-4">
              <div className="flex justify-between items-center">
                <div className="h-4 bg-gray-200 rounded w-32 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded w-32 animate-pulse" />
              </div>
            </div>
          </div>
        ))}

        {/* Summary skeleton */}
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <div className="text-center">
            <div className="h-6 bg-blue-200 rounded w-48 mx-auto mb-2 animate-pulse" />
            <div className="h-8 bg-blue-200 rounded w-64 mx-auto mb-2 animate-pulse" />
            <div className="h-4 bg-blue-100 rounded w-32 mx-auto animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// Specific loading components for different report types
export const TrialBalanceLoading: React.FC<{ className?: string }> = ({ className }) => (
  <LoadingStates type="table" message="Loading Trial Balance..." className={className} />
);

export const ProfitLossLoading: React.FC<{ className?: string }> = ({ className }) => (
  <LoadingStates
    type="skeleton"
    message="Loading Profit & Loss Statement..."
    className={className}
  />
);

export const BalanceSheetLoading: React.FC<{ className?: string }> = ({ className }) => (
  <LoadingStates type="skeleton" message="Loading Balance Sheet..." className={className} />
);

// Loading overlay for export operations
export const ExportLoading: React.FC<{ format: string }> = ({ format }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-lg shadow-xl">
      <div className="flex items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <div>
          <p className="font-medium text-gray-900">Exporting Report</p>
          <p className="text-sm text-gray-600">Generating {format.toUpperCase()} file...</p>
        </div>
      </div>
    </div>
  </div>
);

export default LoadingStates;
