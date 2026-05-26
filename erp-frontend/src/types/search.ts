// Search type definitions for unified search functionality
import { LucideIcon } from 'lucide-react';

export interface SearchResult {
  id: string;
  type: 'invoice' | 'client' | 'supplier' | 'item' | 'staff' | 'receivable' | 'purchase-order';
  title: string;
  subtitle: string;
  description?: string;
  path: string;
  icon?: LucideIcon;
  metadata?: Record<string, any>;
  score?: number;
}

export interface SearchCategory {
  type: SearchResult['type'];
  label: string;
  icon: LucideIcon;
  color: string;
  enabled: boolean;
}

export interface SearchFilters {
  types?: SearchResult['type'][];
  dateRange?: {
    start: Date;
    end: Date;
  };
  status?: string[];
  limit?: number;
}

export interface SearchOptions {
  debounceMs?: number;
  maxResults?: number;
  includeMetadata?: boolean;
  fuzzySearch?: boolean;
}

export interface SearchState {
  query: string;
  results: SearchResult[];
  categories: SearchCategory[];
  filters: SearchFilters;
  isLoading: boolean;
  error: string | null;
  recentSearches: string[];
  selectedIndex: number;
  isOpen: boolean;
}

export interface SearchContextValue {
  searchState: SearchState;
  search: (query: string, options?: SearchOptions) => Promise<void>;
  clearResults: () => void;
  setFilters: (filters: Partial<SearchFilters>) => void;
  selectResult: (result: SearchResult) => void;
  addRecentSearch: (query: string) => void;
  setSelectedIndex: (index: number) => void;
  setIsOpen: (isOpen: boolean) => void;
}
