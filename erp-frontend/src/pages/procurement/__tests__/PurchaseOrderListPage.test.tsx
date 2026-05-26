import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import PurchaseOrderListPage from '../PurchaseOrderListPage';
import { procurementService } from '../../../services/procurementService';

vi.mock('../../../services/procurementService', () => ({
  procurementService: {
    getPurchaseOrders: vi
      .fn()
      .mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(BrowserRouter, undefined, children)
    );
};

describe('PurchaseOrderListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const view = render(React.createElement(PurchaseOrderListPage), { wrapper: createWrapper() });
    expect(view.container).toBeTruthy();
    expect(procurementService.getPurchaseOrders).toHaveBeenCalled();
  });
});
