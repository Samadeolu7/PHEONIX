// UnifiedSearchBar component for global search functionality
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Clock, ArrowRight, Loader2, Filter, ChevronDown } from 'lucide-react';
import { useSearch } from '../../contexts/SearchContext';
import { SearchResult } from '../../types/search';
import { SearchResultItem } from './SearchResultItem';
import { SearchFilters } from './SearchFilters';

interface UnifiedSearchBarProps {
  placeholder?: string;
  className?: string;
  showFilters?: boolean;
  maxResults?: number;
  autoFocus?: boolean;
}

export const UnifiedSearchBar: React.FC<UnifiedSearchBarProps> = ({
  placeholder = 'Search invoices, students, suppliers, items...',
  className = '',
  showFilters = true,
  maxResults = 10,
  autoFocus = false,
}) => {
  const navigate = useNavigate();
  const {
    searchState,
    search,
    clearResults,
    selectResult,
    addRecentSearch,
    setSelectedIndex,
    setIsOpen,
  } = useSearch();

  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Auto focus if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!showSuggestions || searchState.results.length === 0) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex(
            searchState.selectedIndex < searchState.results.length - 1
              ? searchState.selectedIndex + 1
              : 0
          );
          break;

        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex(
            searchState.selectedIndex > 0
              ? searchState.selectedIndex - 1
              : searchState.results.length - 1
          );
          break;

        case 'Enter':
          event.preventDefault();
          if (searchState.selectedIndex >= 0) {
            handleSelectResult(searchState.results[searchState.selectedIndex]);
          } else if (searchState.results.length > 0) {
            handleSelectResult(searchState.results[0]);
          }
          break;

        case 'Escape':
          event.preventDefault();
          handleClearSearch();
          break;
      }
    };

    if (showSuggestions) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showSuggestions, searchState.results, searchState.selectedIndex, setSelectedIndex]);

  // Debounced search
  const debouncedSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        if (query.trim()) {
          search(query, { maxResults });
        } else {
          clearResults();
        }
      }, 300);
    },
    [search, clearResults, maxResults]
  );

  // Handle input change
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setInputValue(value);

    if (value.trim()) {
      setShowSuggestions(true);
      setIsOpen(true);
      debouncedSearch(value);
    } else {
      setShowSuggestions(false);
      setIsOpen(false);
      clearResults();
    }
  };

  // Handle input focus
  const handleInputFocus = () => {
    if (inputValue.trim() || searchState.recentSearches.length > 0) {
      setShowSuggestions(true);
      setIsOpen(true);
    }
  };

  // Handle input blur
  const handleInputBlur = (event: React.FocusEvent) => {
    // Delay hiding suggestions to allow clicking on results
    setTimeout(() => {
      if (!resultsRef.current?.contains(event.relatedTarget as Node)) {
        setShowSuggestions(false);
        setIsOpen(false);
      }
    }, 150);
  };

  // Handle result selection
  const handleSelectResult = (result: SearchResult) => {
    selectResult(result);
    addRecentSearch(inputValue);
    setInputValue('');
    setShowSuggestions(false);
    setIsOpen(false);
    navigate(result.path);
  };

  // Handle recent search selection
  const handleSelectRecentSearch = (query: string) => {
    setInputValue(query);
    setShowSuggestions(true);
    setIsOpen(true);
    debouncedSearch(query);
    inputRef.current?.focus();
  };

  // Handle clear search
  const handleClearSearch = () => {
    setInputValue('');
    setShowSuggestions(false);
    setIsOpen(false);
    clearResults();
    inputRef.current?.focus();
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        resultsRef.current &&
        !resultsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsOpen]);

  const hasResults = searchState.results.length > 0;
  const hasRecentSearches = searchState.recentSearches.length > 0;
  const showRecentSearches = !inputValue.trim() && hasRecentSearches && showSuggestions;

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          className="block w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg 
                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
                   bg-white text-sm placeholder-gray-500
                   transition-colors duration-200"
          aria-label="Global search"
          aria-expanded={showSuggestions}
          aria-haspopup="listbox"
          role="combobox"
          autoComplete="off"
        />

        {/* Clear button */}
        {inputValue && (
          <button
            onClick={handleClearSearch}
            className="absolute inset-y-0 right-8 flex items-center pr-2 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Filter button */}
        {showFilters && (
          <button
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            className={`absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 transition-colors
                       ${showFiltersPanel ? 'text-blue-600' : ''}`}
            aria-label="Search filters"
          >
            <Filter className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search Filters Panel */}
      {showFiltersPanel && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50">
          <SearchFilters onClose={() => setShowFiltersPanel(false)} />
        </div>
      )}

      {/* Search Results */}
      {showSuggestions && (
        <div
          ref={resultsRef}
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 
                   rounded-lg shadow-lg z-40 max-h-96 overflow-y-auto"
          role="listbox"
        >
          {/* Loading state */}
          {searchState.isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-500">Searching...</span>
            </div>
          )}

          {/* Error state */}
          {searchState.error && (
            <div className="p-4 text-sm text-red-600 bg-red-50">{searchState.error}</div>
          )}

          {/* Recent searches */}
          {showRecentSearches && (
            <div className="p-2">
              <div className="flex items-center px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <Clock className="h-3 w-3 mr-1" />
                Recent Searches
              </div>
              {searchState.recentSearches.slice(0, 5).map((query, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectRecentSearch(query)}
                  className="w-full flex items-center px-2 py-2 text-sm text-gray-700 
                           hover:bg-gray-50 rounded transition-colors duration-150"
                >
                  <Clock className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="flex-1 text-left">{query}</span>
                  <ArrowRight className="h-3 w-3 text-gray-400" />
                </button>
              ))}
            </div>
          )}

          {/* Search results */}
          {hasResults && !searchState.isLoading && (
            <div className="p-2">
              {inputValue.trim() && (
                <div className="flex items-center px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Search Results ({searchState.results.length})
                </div>
              )}
              {searchState.results.map((result, index) => (
                <SearchResultItem
                  key={`${result.type}-${result.id}`}
                  result={result}
                  isSelected={index === searchState.selectedIndex}
                  onClick={() => handleSelectResult(result)}
                />
              ))}
            </div>
          )}

          {/* No results */}
          {!hasResults && !searchState.isLoading && inputValue.trim() && !searchState.error && (
            <div className="p-4 text-center text-sm text-gray-500">
              No results found for "{inputValue}"
            </div>
          )}

          {/* Empty state */}
          {!hasResults && !hasRecentSearches && !inputValue.trim() && (
            <div className="p-4 text-center text-sm text-gray-500">
              Start typing to search across all modules
            </div>
          )}
        </div>
      )}
    </div>
  );
};
