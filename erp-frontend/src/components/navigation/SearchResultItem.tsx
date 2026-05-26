// SearchResultItem component for displaying individual search results
import React from 'react';
import { ArrowRight } from 'lucide-react';
import { SearchResult } from '../../types/search';

interface SearchResultItemProps {
  result: SearchResult;
  isSelected: boolean;
  onClick: () => void;
}

// Type-specific styling
const getTypeStyles = (type: SearchResult['type']) => {
  switch (type) {
    case 'invoice':
      return {
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-200',
      };
    case 'client':
      return {
        bgColor: 'bg-green-50',
        textColor: 'text-green-700',
        borderColor: 'border-green-200',
      };
    case 'supplier':
      return {
        bgColor: 'bg-purple-50',
        textColor: 'text-purple-700',
        borderColor: 'border-purple-200',
      };
    case 'item':
      return {
        bgColor: 'bg-orange-50',
        textColor: 'text-orange-700',
        borderColor: 'border-orange-200',
      };
    case 'staff':
      return {
        bgColor: 'bg-indigo-50',
        textColor: 'text-indigo-700',
        borderColor: 'border-indigo-200',
      };
    case 'receivable':
      return {
        bgColor: 'bg-red-50',
        textColor: 'text-red-700',
        borderColor: 'border-red-200',
      };
    case 'purchase-order':
      return {
        bgColor: 'bg-teal-50',
        textColor: 'text-teal-700',
        borderColor: 'border-teal-200',
      };
    default:
      return {
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-700',
        borderColor: 'border-gray-200',
      };
  }
};

// Type labels for display
const getTypeLabel = (type: SearchResult['type']) => {
  switch (type) {
    case 'invoice':
      return 'Invoice';
    case 'client':
      return 'Client';
    case 'supplier':
      return 'Supplier';
    case 'item':
      return 'Item';
    case 'staff':
      return 'Staff';
    case 'receivable':
      return 'Receivable';
    case 'purchase-order':
      return 'Purchase Order';
    default:
      return 'Unknown';
  }
};

export const SearchResultItem: React.FC<SearchResultItemProps> = ({
  result,
  isSelected,
  onClick,
}) => {
  const { bgColor, textColor, borderColor } = getTypeStyles(result.type);
  const typeLabel = getTypeLabel(result.type);
  const Icon = result.icon;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center p-3 text-left rounded-lg transition-all duration-150
                 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
                 ${isSelected ? 'bg-blue-50 ring-2 ring-blue-500' : 'hover:bg-gray-50'}`}
      role="option"
      aria-selected={isSelected}
    >
      {/* Icon */}
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-lg ${bgColor} ${borderColor} border flex items-center justify-center`}
      >
        {Icon && <Icon className={`h-5 w-5 ${textColor}`} />}
      </div>

      {/* Content */}
      <div className="flex-1 ml-3 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900 truncate">{result.title}</p>
          <span
            className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${bgColor} ${textColor}`}
          >
            {typeLabel}
          </span>
        </div>

        <p className="text-sm text-gray-500 truncate mt-0.5">{result.subtitle}</p>

        {result.description && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{result.description}</p>
        )}
      </div>

      {/* Arrow */}
      <div className="flex-shrink-0 ml-2">
        <ArrowRight
          className={`h-4 w-4 transition-colors ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}
        />
      </div>
    </button>
  );
};
