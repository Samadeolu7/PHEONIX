import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { inventoryService } from '../services/inventoryService';
import { useItemStockLevels, useItemMovements } from '../hooks/useInventory';

vi.mock('../services/inventoryService', () => ({
  inventoryService: {
    getItemStockLevels: vi.fn(),
    getItemMovements: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('Inventory Operations Integration Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads stock levels for an item', async () => {
    vi.mocked(inventoryService.getItemStockLevels).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          item: 1,
          location: 1,
          location_name: 'Main Warehouse',
          quantity_on_hand: '120.00',
          quantity_available: '100.00',
          quantity_reserved: '20.00',
        },
      ],
    } as any);

    const { result } = renderHook(() => useItemStockLevels(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(inventoryService.getItemStockLevels).toHaveBeenCalledWith(1);
    expect(result.current.data?.results).toHaveLength(1);
    expect(result.current.data?.results[0].location_name).toBe('Main Warehouse');
  });

  it('loads movement history for an item', async () => {
    vi.mocked(inventoryService.getItemMovements).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 10,
          item: 1,
          movement_type: 'IN',
          movement_date: '2026-01-07',
          quantity: '100.00',
          reference_number: 'PO-2026-001',
        },
        {
          id: 11,
          item: 1,
          movement_type: 'OUT',
          movement_date: '2026-01-08',
          quantity: '-20.00',
          reference_number: 'INV-2026-001',
        },
      ],
    } as any);

    const { result } = renderHook(() => useItemMovements(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(inventoryService.getItemMovements).toHaveBeenCalledWith(1);
    expect(result.current.data?.results).toHaveLength(2);
    expect(result.current.data?.results[0].reference_number).toBe('PO-2026-001');
  });
});
