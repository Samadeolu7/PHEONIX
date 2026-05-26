// src/pages/receivables/__tests__/CollectionWorkbench.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import CollectionWorkbench from '../CollectionWorkbench';
import { receivablesService } from '../../../services/receivablesService';
import { userManagementService } from '../../../services/userManagementService';

// Mock the services
vi.mock('../../../services/receivablesService');
vi.mock('../../../services/userManagementService');
vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const mockReceivablesService = receivablesService as any;
const mockUserManagementService = userManagementService as any;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('CollectionWorkbench', () => {
  beforeEach(() => {
    // Setup mocks
    mockReceivablesService.getReceivables = vi.fn().mockResolvedValue({
      results: [
        {
          id: 1,
          client: 1,
          client_name: 'Test Client',
          receivable_type: 'invoice',
          content_type: 1,
          content_type_name: 'Invoice',
          object_id: 1,
          reference_number: 'INV-001',
          original_amount: '100000',
          balance: '100000',
          due_date: '2024-01-15',
          status: 'overdue',
          aging_bucket: '31-60',
          days_overdue: 45,
          accrued_interest: '0',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
      count: 1,
      next: null,
      previous: null,
    });

    mockReceivablesService.getActivityLogs = vi.fn().mockResolvedValue({
      results: [],
      count: 0,
      next: null,
      previous: null,
    });

    mockUserManagementService.getUsers = vi.fn().mockResolvedValue([
      {
        id: 1,
        username: 'collector1',
        email: 'collector1@test.com',
        full_name: 'John Collector',
        is_active: true,
        role_names: ['Collections'],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the collection workbench header', async () => {
    render(<CollectionWorkbench />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Collection Workbench')).toBeInTheDocument();
      expect(
        screen.getByText('Manage collection activities and track customer interactions')
      ).toBeInTheDocument();
    });
  });

  it('displays workbench statistics', async () => {
    render(<CollectionWorkbench />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Total Assigned')).toBeInTheDocument();
      expect(screen.getByText('Contacted Today')).toBeInTheDocument();
      expect(screen.getByText('Promises Due')).toBeInTheDocument();
      expect(screen.getByText('Escalation Needed')).toBeInTheDocument();
    });
  });

  it('loads and displays receivables list', async () => {
    render(<CollectionWorkbench />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getAllByText('Test Client')).toHaveLength(2); // One in list, one in header
      expect(screen.getAllByText('INV-001')).toHaveLength(2); // One in list, one in header
    });

    expect(mockReceivablesService.getReceivables).toHaveBeenCalledWith({
      status: 'overdue',
      assigned_to: undefined,
      aging_bucket: undefined,
      search: undefined,
      ordering: '-days_overdue,-balance',
    });
  });

  it('loads collectors for assignment', async () => {
    render(<CollectionWorkbench />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockUserManagementService.getUsers).toHaveBeenCalled();
    });
  });

  it('shows activity timeline when receivable is selected', async () => {
    render(<CollectionWorkbench />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Activity Timeline')).toBeInTheDocument();
    });
  });

  it('shows payment promises sidebar', async () => {
    render(<CollectionWorkbench />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Payment Promises')).toBeInTheDocument();
    });
  });

  it('handles loading state', () => {
    // Mock loading state
    mockReceivablesService.getReceivables = vi.fn().mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<CollectionWorkbench />, { wrapper: createWrapper() });

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('handles empty receivables list', async () => {
    mockReceivablesService.getReceivables = vi.fn().mockResolvedValue({
      results: [],
      count: 0,
      next: null,
      previous: null,
    });

    render(<CollectionWorkbench />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('No Receivables')).toBeInTheDocument();
      expect(screen.getByText('No receivables match your current filters.')).toBeInTheDocument();
    });
  });
});
