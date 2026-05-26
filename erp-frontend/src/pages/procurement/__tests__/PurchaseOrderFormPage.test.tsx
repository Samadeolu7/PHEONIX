import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import PurchaseOrderFormPage from '../PurchaseOrderFormPage';
import { procurementService } from '../../../services/procurementService';

vi.mock('../../../services/procurementService', () => ({
  procurementService: {
    getSuppliers: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    getInventoryItems: vi
      .fn()
      .mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    getInventoryLocations: vi
      .fn()
      .mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    createPurchaseOrder: vi.fn(),
    updatePurchaseOrder: vi.fn(),
    getPurchaseOrder: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: undefined }),
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
      React.createElement(MemoryRouter, undefined, children)
    );
};

describe('PurchaseOrderFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const view = render(React.createElement(PurchaseOrderFormPage), { wrapper: createWrapper() });
    expect(view.container).toBeTruthy();
    expect(procurementService.getSuppliers).toHaveBeenCalled();
  });
});
