// SearchDemoPage for testing unified search functionality
import React from 'react';
import { Search, Keyboard, Filter, Clock, ArrowRight } from 'lucide-react';
import { UnifiedSearchBar } from '../components/navigation/UnifiedSearchBar';
import { SearchShortcut } from '../components/navigation/SearchShortcut';
import { useSearch } from '../contexts/SearchContext';
import { useAuth } from '../contexts/AuthContext';

export const SearchDemoPage: React.FC = () => {
  const { searchState } = useSearch();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Unified Search Demo</h1>
          <p className="text-lg text-gray-600">
            Test the global search functionality across all ERP modules
          </p>
          {user && (
            <p className="text-sm text-gray-500 mt-2">
              Logged in as: <span className="font-medium">{user.email}</span>
              {user.roles && user.roles.length > 0 && (
                <span className="ml-2">(Roles: {user.roles.join(', ')})</span>
              )}
            </p>
          )}
        </div>

        {/* Main Search Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Main Search Interface</h2>
          <UnifiedSearchBar
            placeholder="Search invoices, students, suppliers, items, staff..."
            className="w-full"
            showFilters={true}
            maxResults={15}
          />
        </div>

        {/* Search Shortcut Demo */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Search Shortcut (Header Style)
          </h2>
          <div className="max-w-md">
            <SearchShortcut placeholder="Quick search..." />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Click or press{' '}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Cmd/Ctrl + K</kbd> to activate
          </p>
        </div>

        {/* Features Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Search Features */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <Search className="h-5 w-5 text-blue-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Search Features</h3>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center">
                <ArrowRight className="h-3 w-3 text-gray-400 mr-2" />
                Multi-module search (invoices, students, suppliers, items, staff, receivables,
                purchase orders)
              </li>
              <li className="flex items-center">
                <ArrowRight className="h-3 w-3 text-gray-400 mr-2" />
                Real-time search with debouncing (300ms)
              </li>
              <li className="flex items-center">
                <ArrowRight className="h-3 w-3 text-gray-400 mr-2" />
                Relevance-based result sorting
              </li>
              <li className="flex items-center">
                <ArrowRight className="h-3 w-3 text-gray-400 mr-2" />
                Type-specific result formatting
              </li>
              <li className="flex items-center">
                <ArrowRight className="h-3 w-3 text-gray-400 mr-2" />
                Search result caching (5 minutes)
              </li>
            </ul>
          </div>

          {/* Keyboard Navigation */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <Keyboard className="h-5 w-5 text-green-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Keyboard Navigation</h3>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Open search</span>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Cmd/Ctrl + K</kbd>
              </div>
              <div className="flex justify-between">
                <span>Navigate results</span>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">↑ ↓</kbd>
              </div>
              <div className="flex justify-between">
                <span>Select result</span>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Enter</kbd>
              </div>
              <div className="flex justify-between">
                <span>Close search</span>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Escape</kbd>
              </div>
              <div className="flex justify-between">
                <span>Jump to first/last</span>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Home/End</kbd>
              </div>
              <div className="flex justify-between">
                <span>Page up/down</span>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">PgUp/PgDn</kbd>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <Filter className="h-5 w-5 text-purple-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Search Filters</h3>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center">
                <ArrowRight className="h-3 w-3 text-gray-400 mr-2" />
                Filter by content type
              </li>
              <li className="flex items-center">
                <ArrowRight className="h-3 w-3 text-gray-400 mr-2" />
                Date range filtering
              </li>
              <li className="flex items-center">
                <ArrowRight className="h-3 w-3 text-gray-400 mr-2" />
                Result limit control
              </li>
              <li className="flex items-center">
                <ArrowRight className="h-3 w-3 text-gray-400 mr-2" />
                Filter persistence
              </li>
            </ul>
          </div>

          {/* Recent Searches */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <Clock className="h-5 w-5 text-orange-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Recent Searches</h3>
            </div>
            {searchState.recentSearches.length > 0 ? (
              <ul className="space-y-1 text-sm text-gray-600">
                {searchState.recentSearches.slice(0, 5).map((search, index) => (
                  <li key={index} className="flex items-center">
                    <Clock className="h-3 w-3 text-gray-400 mr-2" />
                    {search}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No recent searches yet</p>
            )}
          </div>
        </div>

        {/* Search Types */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Searchable Content Types</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                type: 'invoice',
                label: 'Invoices',
                color: 'blue',
                description: 'Invoice numbers, client names, amounts',
              },
              {
                type: 'student',
                label: 'Students',
                color: 'green',
                description: 'Student names, emails, classifications',
              },
              {
                type: 'supplier',
                label: 'Suppliers',
                color: 'purple',
                description: 'Supplier names, contact information',
              },
              {
                type: 'item',
                label: 'Items',
                color: 'orange',
                description: 'Item names, codes, categories',
              },
              {
                type: 'staff',
                label: 'Staff',
                color: 'indigo',
                description: 'Staff names, departments, positions',
              },
              {
                type: 'receivable',
                label: 'Receivables',
                color: 'red',
                description: 'Customer names, amounts, due dates',
              },
              {
                type: 'purchase-order',
                label: 'Purchase Orders',
                color: 'teal',
                description: 'PO numbers, suppliers, amounts',
              },
            ].map(({ type, label, color, description }) => (
              <div
                key={type}
                className={`p-3 rounded-lg bg-${color}-50 border border-${color}-200`}
              >
                <h4 className={`font-medium text-${color}-900 mb-1`}>{label}</h4>
                <p className={`text-xs text-${color}-700`}>{description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Usage Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">How to Use</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
            <li>Click in the search bar or press Cmd/Ctrl + K to start searching</li>
            <li>Type your search query - results appear as you type</li>
            <li>Use arrow keys to navigate through results</li>
            <li>Press Enter to select a result or click on it</li>
            <li>Use the filter button to narrow down search types</li>
            <li>Recent searches are saved and can be quickly accessed</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default SearchDemoPage;
