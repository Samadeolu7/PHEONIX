// SearchFilters component for filtering search results
import React, { useState } from 'react';
import { X, Check, Calendar, Filter } from 'lucide-react';
import { useSearch } from '../../contexts/SearchContext';
import { SearchResult } from '../../types/search';

interface SearchFiltersProps {
  onClose: () => void;
}

export const SearchFilters: React.FC<SearchFiltersProps> = ({ onClose }) => {
  const { searchState, setFilters } = useSearch();
  const [localFilters, setLocalFilters] = useState(searchState.filters);

  // Available search types
  const searchTypes: Array<{
    type: SearchResult['type'];
    label: string;
    color: string;
  }> = [
    { type: 'invoice', label: 'Invoices', color: 'blue' },
    { type: 'client', label: 'Clients', color: 'green' },
    { type: 'supplier', label: 'Suppliers', color: 'purple' },
    { type: 'item', label: 'Items', color: 'orange' },
    { type: 'staff', label: 'Staff', color: 'indigo' },
    { type: 'receivable', label: 'Receivables', color: 'red' },
    { type: 'purchase-order', label: 'Purchase Orders', color: 'teal' },
  ];

  // Handle type filter toggle
  const handleTypeToggle = (type: SearchResult['type']) => {
    const currentTypes = localFilters.types || [];
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter(t => t !== type)
      : [...currentTypes, type];

    setLocalFilters({
      ...localFilters,
      types: newTypes.length === 0 ? undefined : newTypes,
    });
  };

  // Handle date range change
  const handleDateRangeChange = (field: 'start' | 'end', value: string) => {
    const dateRange = localFilters.dateRange || { start: new Date(), end: new Date() };
    const newDateRange = {
      ...dateRange,
      [field]: new Date(value),
    };

    setLocalFilters({
      ...localFilters,
      dateRange: newDateRange,
    });
  };

  // Handle limit change
  const handleLimitChange = (limit: number) => {
    setLocalFilters({
      ...localFilters,
      limit,
    });
  };

  // Apply filters
  const handleApplyFilters = () => {
    setFilters(localFilters);
    onClose();
  };

  // Reset filters
  const handleResetFilters = () => {
    const resetFilters = {};
    setLocalFilters(resetFilters);
    setFilters(resetFilters);
  };

  // Clear all filters
  const handleClearAll = () => {
    handleResetFilters();
    onClose();
  };

  const selectedTypes = localFilters.types || [];
  const hasActiveFilters = selectedTypes.length > 0 || localFilters.dateRange || localFilters.limit;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-80">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Filter className="h-4 w-4 text-gray-500 mr-2" />
          <h3 className="text-sm font-medium text-gray-900">Search Filters</h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close filters"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content Types */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-2">Content Types</label>
        <div className="space-y-2">
          {searchTypes.map(({ type, label, color }) => {
            const isSelected = selectedTypes.includes(type);
            return (
              <button
                key={type}
                onClick={() => handleTypeToggle(type)}
                className={`w-full flex items-center justify-between p-2 rounded-md border transition-all
                           ${
                             isSelected
                               ? `bg-${color}-50 border-${color}-200 text-${color}-700`
                               : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                           }`}
              >
                <span className="text-sm">{label}</span>
                {isSelected && <Check className={`h-4 w-4 text-${color}-600`} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date Range */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-2">
          <Calendar className="h-3 w-3 inline mr-1" />
          Date Range
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={localFilters.dateRange?.start.toISOString().split('T')[0] || ''}
              onChange={e => handleDateRangeChange('start', e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={localFilters.dateRange?.end.toISOString().split('T')[0] || ''}
              onChange={e => handleDateRangeChange('end', e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Result Limit */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-2">Max Results</label>
        <select
          value={localFilters.limit || 10}
          onChange={e => handleLimitChange(Number(e.target.value))}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value={5}>5 results</option>
          <option value={10}>10 results</option>
          <option value={20}>20 results</option>
          <option value={50}>50 results</option>
        </select>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
        <button
          onClick={handleClearAll}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          disabled={!hasActiveFilters}
        >
          Clear All
        </button>

        <div className="flex space-x-2">
          <button
            onClick={handleResetFilters}
            className="px-3 py-1 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleApplyFilters}
            className="px-3 py-1 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Active filters indicator */}
      {hasActiveFilters && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="flex items-center text-xs text-gray-500">
            <span className="mr-1">Active filters:</span>
            {selectedTypes.length > 0 && (
              <span className="bg-blue-100 text-blue-700 px-1 rounded mr-1">
                {selectedTypes.length} type{selectedTypes.length !== 1 ? 's' : ''}
              </span>
            )}
            {localFilters.dateRange && (
              <span className="bg-green-100 text-green-700 px-1 rounded mr-1">Date range</span>
            )}
            {localFilters.limit && localFilters.limit !== 10 && (
              <span className="bg-orange-100 text-orange-700 px-1 rounded">
                Limit: {localFilters.limit}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
