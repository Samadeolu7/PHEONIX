import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTrialBalance } from '../useTrialBalance';
import { financialReportsService } from '../../services/financialReportsService';

vi.mock('../../services/financialReportsService', () => ({
  financialReportsService: {
    getTrialBalance: vi.fn(),
    downloadReport: vi.fn(),
  },
}));

const mockFinancialReportsService = vi.mocked(financialReportsService);

const mockTrialBalanceData = {
  report_date: '2024-01-26',
  date_range: {
    start: '2024-01-01',
    end: '2024-01-26',
  },
  accounts: [
    {
      code: '1000',
      name: 'Cash',
      account_type: 'ASSET' as const,
      level: 'CHILD' as const,
      debit: '10000.00',
      credit: '0.00',
      balance: '10000.00',
    },
  ],
  totals: {
    total_debits: '10000.00',
    total_credits: '10000.00',
    difference: '0.00',
  },
  is_balanced: true,
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useTrialBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches trial balance data successfully', async () => {
    mockFinancialReportsService.getTrialBalance.mockResolvedValue(mockTrialBalanceData as any);

    const { result } = renderHook(() => useTrialBalance({ detail_level: 'summary' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockTrialBalanceData);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  it('handles service errors', async () => {
    mockFinancialReportsService.getTrialBalance.mockRejectedValue(
      new Error('Failed to fetch trial balance')
    );

    const { result } = renderHook(() => useTrialBalance({ detail_level: 'summary' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Failed to fetch trial balance');
    });
  });
});
