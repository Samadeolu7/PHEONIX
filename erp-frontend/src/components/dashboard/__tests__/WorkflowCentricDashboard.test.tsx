// WorkflowCentricDashboard test
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { WorkflowCentricDashboard } from '../WorkflowCentricDashboard';

// Mock the auth context
const mockUser = {
  id: '1',
  username: 'testuser',
  first_name: 'Test',
  last_name: 'User',
  email: 'test@example.com',
  is_staff: true,
  is_system_admin: false,
  permissions: [],
};

// Mock the useAuth hook
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    login: vi.fn(),
    logout: vi.fn(),
    loading: false,
  }),
}));

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('WorkflowCentricDashboard', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<WorkflowCentricDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Business Process Flow')).toBeInTheDocument();
    });
  });

  it('displays performance metrics', async () => {
    renderWithProviders(<WorkflowCentricDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Performance Dashboard')).toBeInTheDocument();
    });
  });

  it('shows business workflows section', async () => {
    renderWithProviders(<WorkflowCentricDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Business Workflows')).toBeInTheDocument();
    });
  });

  it('displays task management section', async () => {
    renderWithProviders(<WorkflowCentricDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Task Management')).toBeInTheDocument();
    });
  });

  it('shows workflow activity feed', async () => {
    renderWithProviders(<WorkflowCentricDashboard />);
    // Wait for the loading to complete (1 second timeout in the component)
    await waitFor(
      () => {
        expect(screen.getByText('Workflow Activity')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });
});
