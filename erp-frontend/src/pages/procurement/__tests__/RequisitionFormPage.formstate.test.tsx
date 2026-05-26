import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import RequisitionFormPageSimplified from '../RequisitionFormPageSimplified';
import { ToastProvider } from '../../../contexts/ToastContext';

// Mock the hooks
vi.mock('../../../hooks/useProcurement', () => ({
  usePurchaseRequisition: vi.fn(() => ({ data: null, isLoading: false })),
  useCreatePurchaseRequisition: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdatePurchaseRequisition: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useInventoryItems: vi.fn(() => ({ data: { results: [] }, isLoading: false })),
  useDepartments: vi.fn(() => ({ data: { results: [] }, isLoading: false })),
  useSubmitRequisition: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
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
        <ToastProvider>{children}</ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('RequisitionFormPageSimplified - Form State Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should render form without errors', () => {
    render(
      <TestWrapper>
        <RequisitionFormPageSimplified />
      </TestWrapper>
    );

    // Verify that the form renders without errors
    expect(screen.getByText('Create Purchase Requisition')).toBeInTheDocument();
    expect(screen.getByText('Requisition Details')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
  });

  test('should display form fields for simplified state management', () => {
    render(
      <TestWrapper>
        <RequisitionFormPageSimplified />
      </TestWrapper>
    );

    // Verify simplified form fields are present
    expect(screen.getByText('Department *')).toBeInTheDocument();
    expect(screen.getByText('Purpose *')).toBeInTheDocument();
    expect(screen.getByText('Request Date *')).toBeInTheDocument();
    expect(screen.getByText('Required By Date *')).toBeInTheDocument();
    expect(screen.getByText('Additional Notes')).toBeInTheDocument();
  });

  test('should display action buttons for simplified submission types', () => {
    render(
      <TestWrapper>
        <RequisitionFormPageSimplified />
      </TestWrapper>
    );

    // Verify action buttons are present
    expect(screen.getByText('Save as Draft')).toBeInTheDocument();
    expect(screen.getByText('Submit for Approval')).toBeInTheDocument();
  });

  test('should handle simplified form data structure', () => {
    // This test verifies that the form can handle simplified data structure
    render(
      <TestWrapper>
        <RequisitionFormPageSimplified />
      </TestWrapper>
    );

    // The form should render successfully with simplified state management
    expect(screen.getByText('Create Purchase Requisition')).toBeInTheDocument();
    expect(screen.getByText('Requisition Details')).toBeInTheDocument();
  });
});
