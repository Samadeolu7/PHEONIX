// src/pages/receivables/__tests__/CollectionsDashboard.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CollectionsDashboard from '../CollectionsDashboard';
import { ToastProvider } from '../../../contexts/ToastContext';

// Mock the services
vi.mock('../../../services/receivablesService', () => ({
  receivablesService: {
    getReceivables: vi.fn().mockResolvedValue({
      results: [
        {
          id: 1,
          client_name: 'Test Client',
          balance: '100000.00',
          days_overdue: 15,
          aging_bucket: '1-30',
          status: 'overdue',
          assigned_to: null,
          last_reminder_sent: null,
          reference_number: 'INV-001',
        },
      ],
    }),
    assignCollector: vi.fn().mockResolvedValue({}),
    sendReminder: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../../services/userManagementService', () => ({
  userManagementService: {
    getUsers: vi.fn().mockResolvedValue([
      {
        id: 1,
        full_name: 'John Collector',
        is_active: true,
        role_names: ['Collections'],
      },
    ]),
  },
}));

// Mock the useToast hook
vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>{component}</ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('CollectionsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the collections dashboard header', async () => {
    renderWithProviders(<CollectionsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Collections Dashboard')).toBeInTheDocument();
      expect(
        screen.getByText('Manage overdue receivables and collection activities')
      ).toBeInTheDocument();
    });
  });

  it('displays key metrics cards', async () => {
    renderWithProviders(<CollectionsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Total Overdue')).toBeInTheDocument();
      expect(screen.getByText('Assigned')).toBeInTheDocument();
      expect(screen.getAllByText('Unassigned')).toHaveLength(3); // Metrics card, dropdown, and table
      expect(screen.getByText('Avg Resolution')).toBeInTheDocument();
    });
  });

  it('displays aging breakdown section', async () => {
    renderWithProviders(<CollectionsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Overdue Aging Breakdown')).toBeInTheDocument();
    });
  });

  it('displays escalation queue section', async () => {
    renderWithProviders(<CollectionsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Escalation Queue')).toBeInTheDocument();
    });
  });

  it('displays collector performance section', async () => {
    renderWithProviders(<CollectionsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Collector Performance')).toBeInTheDocument();
    });
  });

  it('displays overdue receivables table', async () => {
    renderWithProviders(<CollectionsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Overdue Receivables')).toBeInTheDocument();
      expect(screen.getByText('Client')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('Days Overdue')).toBeInTheDocument();
      expect(screen.getByText('Assigned To')).toBeInTheDocument();
    });
  });

  it('shows refresh button', async () => {
    renderWithProviders(<CollectionsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });

  it('shows filter controls', async () => {
    renderWithProviders(<CollectionsDashboard />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search clients...')).toBeInTheDocument();
      expect(screen.getByDisplayValue('All Ages')).toBeInTheDocument();
      expect(screen.getByDisplayValue('All Collectors')).toBeInTheDocument();
    });
  });
});
