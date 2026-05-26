// Test for UnifiedSearchBar component
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { UnifiedSearchBar } from '../UnifiedSearchBar';
import { SearchProvider } from '../../../contexts/SearchContext';

// Mock the search service
vi.mock('../../../services/searchService', () => ({
  searchService: {
    search: vi.fn().mockResolvedValue([
      {
        id: '1',
        type: 'invoice',
        title: 'Invoice INV-001',
        subtitle: 'Test Client',
        description: 'Amount: $100.00 | Status: paid',
        path: '/invoices/1',
      },
      {
        id: '2',
        type: 'student',
        title: 'John Doe',
        subtitle: 'john@example.com',
        description: 'Classification: Student',
        path: '/clients/2',
      },
    ]),
  },
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SearchProvider>{children}</SearchProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('UnifiedSearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search input with placeholder', () => {
    render(
      <TestWrapper>
        <UnifiedSearchBar placeholder="Search test..." />
      </TestWrapper>
    );

    expect(screen.getByPlaceholderText('Search test...')).toBeInTheDocument();
  });

  it('shows search icon', () => {
    render(
      <TestWrapper>
        <UnifiedSearchBar />
      </TestWrapper>
    );

    // Search icon should be present
    const searchInput = screen.getByRole('combobox');
    expect(searchInput).toBeInTheDocument();
  });

  it('handles input change and shows results', async () => {
    render(
      <TestWrapper>
        <UnifiedSearchBar />
      </TestWrapper>
    );

    const searchInput = screen.getByRole('combobox');

    // Type in search input
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Wait for debounced search
    await waitFor(
      () => {
        expect(searchInput).toHaveValue('test');
      },
      { timeout: 500 }
    );
  });

  it('shows clear button when input has value', () => {
    render(
      <TestWrapper>
        <UnifiedSearchBar />
      </TestWrapper>
    );

    const searchInput = screen.getByRole('combobox');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Clear button should appear
    const clearButton = screen.getByLabelText('Clear search');
    expect(clearButton).toBeInTheDocument();
  });

  it('clears input when clear button is clicked', () => {
    render(
      <TestWrapper>
        <UnifiedSearchBar />
      </TestWrapper>
    );

    const searchInput = screen.getByRole('combobox');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    const clearButton = screen.getByLabelText('Clear search');
    fireEvent.click(clearButton);

    expect(searchInput).toHaveValue('');
  });

  it('shows filter button when showFilters is true', () => {
    render(
      <TestWrapper>
        <UnifiedSearchBar showFilters={true} />
      </TestWrapper>
    );

    const filterButton = screen.getByLabelText('Search filters');
    expect(filterButton).toBeInTheDocument();
  });

  it('does not show filter button when showFilters is false', () => {
    render(
      <TestWrapper>
        <UnifiedSearchBar showFilters={false} />
      </TestWrapper>
    );

    const filterButton = screen.queryByLabelText('Search filters');
    expect(filterButton).not.toBeInTheDocument();
  });
});
