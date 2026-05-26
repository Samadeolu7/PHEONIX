// useBalanceSheet Hook
// Custom hook for Balance Sheet report with TanStack Query

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { financialReportsService } from '../services/financialReportsService';
import { BalanceSheetData, BalanceSheetParams, ExportFormat } from '../types/financialReports';

export interface UseBalanceSheetReturn {
  data: BalanceSheetData | undefined;
  loading: boolean;
  error: string | null;
  refetch: (params?: BalanceSheetParams) => Promise<void>;
  exportReport: (format: ExportFormat) => Promise<void>;
  isRefetching: boolean;
}

export const useBalanceSheet = (params: BalanceSheetParams = {}): UseBalanceSheetReturn => {
  const queryClient = useQueryClient();

  // Generate stable query key based on parameters
  const queryKey = ['balance-sheet', JSON.stringify(params)];

  // Main query for fetching balance sheet data
  const {
    data,
    isLoading,
    error,
    refetch: queryRefetch,
    isRefetching,
  } = useQuery({
    queryKey,
    queryFn: () => financialReportsService.getBalanceSheet(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime in v5)
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: true, // Always enabled for balance sheet (as_of_date is optional)
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: ({ format, params }: { format: ExportFormat; params: BalanceSheetParams }) =>
      financialReportsService.downloadReport('balance-sheet', format, params),
    onError: error => {
      console.error('Export failed:', error);
    },
  });

  // Refetch function - just refetch current query, don't invalidate
  // Wrapped in useCallback so the reference stays stable across renders,
  // preventing the infinite-refetch loop caused by BalanceSheetPage's
  // handleFiltersChange → ReportFilters debouncedOnChange dependency chain.
  const refetch = useCallback(
    async (newParams?: BalanceSheetParams) => {
      if (newParams) {
        // If new params provided, invalidate and let React Query handle the refetch
        await queryClient.invalidateQueries({
          queryKey: ['balance-sheet', JSON.stringify(newParams)],
        });
      } else {
        // Just refetch current query
        await queryRefetch();
      }
    },
    [queryClient, queryRefetch]
  );

  // Export function
  const exportReport = useCallback(
    async (format: ExportFormat) => {
      await exportMutation.mutateAsync({ format, params });
    },
    [exportMutation, params]
  );

  return {
    data,
    loading: isLoading,
    error: error?.message || null,
    refetch,
    exportReport,
    isRefetching,
  };
};

export default useBalanceSheet;
