// Search context for managing global search state
import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import {
  FileText,
  Users,
  Building2,
  Package,
  UserCheck,
  Receipt,
  ShoppingCart,
} from 'lucide-react';
import {
  SearchState,
  SearchContextValue,
  SearchResult,
  SearchFilters,
  SearchOptions,
  SearchCategory,
} from '../types/search';
import { searchService } from '../services/searchService';

// Initial search categories
const initialCategories: SearchCategory[] = [
  {
    type: 'invoice',
    label: 'Invoices',
    icon: FileText,
    color: 'blue',
    enabled: true,
  },
  {
    type: 'client',
    label: 'Clients',
    icon: Users,
    color: 'green',
    enabled: true,
  },
  {
    type: 'supplier',
    label: 'Suppliers',
    icon: Building2,
    color: 'purple',
    enabled: true,
  },
  {
    type: 'item',
    label: 'Items',
    icon: Package,
    color: 'orange',
    enabled: true,
  },
  {
    type: 'staff',
    label: 'Staff',
    icon: UserCheck,
    color: 'indigo',
    enabled: true,
  },
  {
    type: 'receivable',
    label: 'Receivables',
    icon: Receipt,
    color: 'red',
    enabled: true,
  },
  {
    type: 'purchase-order',
    label: 'Purchase Orders',
    icon: ShoppingCart,
    color: 'teal',
    enabled: true,
  },
];

// Initial state
const initialState: SearchState = {
  query: '',
  results: [],
  categories: initialCategories,
  filters: {},
  isLoading: false,
  error: null,
  recentSearches: [],
  selectedIndex: -1,
  isOpen: false,
};

// Action types
type SearchAction =
  | { type: 'SET_QUERY'; payload: string }
  | { type: 'SET_RESULTS'; payload: SearchResult[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_FILTERS'; payload: Partial<SearchFilters> }
  | { type: 'ADD_RECENT_SEARCH'; payload: string }
  | { type: 'SET_SELECTED_INDEX'; payload: number }
  | { type: 'SET_IS_OPEN'; payload: boolean }
  | { type: 'CLEAR_RESULTS' }
  | { type: 'LOAD_RECENT_SEARCHES'; payload: string[] };

// Reducer
function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.payload };

    case 'SET_RESULTS':
      return { ...state, results: action.payload, selectedIndex: -1 };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'SET_FILTERS':
      return {
        ...state,
        filters: { ...state.filters, ...action.payload },
      };

    case 'ADD_RECENT_SEARCH':
      const newRecentSearches = [
        action.payload,
        ...state.recentSearches.filter(search => search !== action.payload),
      ].slice(0, 10); // Keep only last 10 searches
      return { ...state, recentSearches: newRecentSearches };

    case 'SET_SELECTED_INDEX':
      return { ...state, selectedIndex: action.payload };

    case 'SET_IS_OPEN':
      return { ...state, isOpen: action.payload };

    case 'CLEAR_RESULTS':
      return {
        ...state,
        results: [],
        selectedIndex: -1,
        error: null,
      };

    case 'LOAD_RECENT_SEARCHES':
      return { ...state, recentSearches: action.payload };

    default:
      return state;
  }
}

// Context
const SearchContext = createContext<SearchContextValue | undefined>(undefined);

// Provider component
interface SearchProviderProps {
  children: React.ReactNode;
}

export const SearchProvider: React.FC<SearchProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(searchReducer, initialState);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    const savedSearches = localStorage.getItem('recentSearches');
    if (savedSearches) {
      try {
        const searches = JSON.parse(savedSearches);
        dispatch({ type: 'LOAD_RECENT_SEARCHES', payload: searches });
      } catch (error) {
        console.error('Failed to load recent searches:', error);
      }
    }
  }, []);

  // Save recent searches to localStorage
  useEffect(() => {
    if (state.recentSearches.length > 0) {
      localStorage.setItem('recentSearches', JSON.stringify(state.recentSearches));
    }
  }, [state.recentSearches]);

  // Debounced search function
  const search = useCallback(
    async (query: string, options: SearchOptions = {}) => {
      if (!query.trim()) {
        dispatch({ type: 'CLEAR_RESULTS' });
        return;
      }

      dispatch({ type: 'SET_QUERY', payload: query });
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const results = await searchService.search(query, state.filters, options);
        dispatch({ type: 'SET_RESULTS', payload: results });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Search failed';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
        dispatch({ type: 'SET_RESULTS', payload: [] });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    [state.filters]
  );

  const clearResults = useCallback(() => {
    dispatch({ type: 'CLEAR_RESULTS' });
  }, []);

  const setFilters = useCallback((filters: Partial<SearchFilters>) => {
    dispatch({ type: 'SET_FILTERS', payload: filters });
  }, []);

  const selectResult = useCallback(
    (result: SearchResult) => {
      // Add to recent searches
      dispatch({ type: 'ADD_RECENT_SEARCH', payload: state.query });

      // Navigate to result (this will be handled by the component using the context)
      // The component should handle navigation using React Router
    },
    [state.query]
  );

  const addRecentSearch = useCallback((query: string) => {
    if (query.trim()) {
      dispatch({ type: 'ADD_RECENT_SEARCH', payload: query.trim() });
    }
  }, []);

  const setSelectedIndex = useCallback((index: number) => {
    dispatch({ type: 'SET_SELECTED_INDEX', payload: index });
  }, []);

  const setIsOpen = useCallback((isOpen: boolean) => {
    dispatch({ type: 'SET_IS_OPEN', payload: isOpen });
  }, []);

  const contextValue: SearchContextValue = {
    searchState: state,
    search,
    clearResults,
    setFilters,
    selectResult,
    addRecentSearch,
    setSelectedIndex,
    setIsOpen,
  };

  return <SearchContext.Provider value={contextValue}>{children}</SearchContext.Provider>;
};

// Hook to use search context
export const useSearch = (): SearchContextValue => {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
};
