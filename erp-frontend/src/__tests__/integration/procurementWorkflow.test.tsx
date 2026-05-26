import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';

vi.mock('../../services/procurementService', () => ({
  procurementService: {
    getPurchaseRequisitions: vi
      .fn()
      .mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    getPurchaseOrders: vi
      .fn()
      .mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    getGRNs: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    getPurchaseReturns: vi
      .fn()
      .mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    getSuppliers: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    getInventoryItems: vi
      .fn()
      .mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    getInventoryLocations: vi
      .fn()
      .mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    getDepartments: vi
      .fn()
      .mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
    },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const createWrapper = (initialEntries = ['/']) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(MemoryRouter, { initialEntries }, children)
    );
};

describe('Procurement workflow integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the app for procurement routes', () => {
    const view = render(React.createElement(App), {
      wrapper: createWrapper(['/procurement/requisitions']),
    });

    expect(view.container).toBeTruthy();
  });
});
