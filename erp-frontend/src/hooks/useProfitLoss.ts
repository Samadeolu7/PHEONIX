// useProfitLoss Hook
// Custom hook for Profit & Loss report with TanStack Query integration

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financialReportsService } from '../services/financialReportsService';
import { ProfitLossData, ProfitLossParams, ExportFormat } from '../types/financialReports';

export interface UseProfitLossReturn {
  data: ProfitLossData | undefined;
  loading: boolean;
  error: string | null;
  refetch: (params?: ProfitLossParams) => Promise<void>;
  exportReport: (format: ExportFormat) => Promise<void>;
  isRefetching: boolean;
}

export const useProfitLoss = (initialParams: ProfitLossParams): UseProfitLossReturn => {
  const queryClient = useQueryClient();

  // Create a stable query key
  const queryKey = ['profitLoss', initialParams];

  // Main query for fetching profit & loss data
  const {
    data,
    isLoading,
    error,
    refetch: queryRefetch,
    isRefetching,
  } = useQuery({
    queryKey,
    queryFn: () => financialReportsService.getProfitLoss(initialParams),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime in v5)
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: !!initialParams.start_date, // Only enabled if start_date is provided
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: (format: ExportFormat) =>
      financialReportsService.downloadReport('profit-loss', format, initialParams),
    onError: error => {
      console.error('Export failed:', error);
    },
  });

  // Refetch function that updates query parameters
  const refetch = async (params?: ProfitLossParams) => {
    if (params) {
      // Update query with new parameters
      const newQueryKey = ['profitLoss', params];
      await queryClient.fetchQuery({
        queryKey: newQueryKey,
        queryFn: () => financialReportsService.getProfitLoss(params),
        staleTime: 5 * 60 * 1000,
      });
    } else {
      // Refetch with current parameters
      await queryRefetch();
    }
  };

  // Export function
  const exportReport = async (format: ExportFormat) => {
    await exportMutation.mutateAsync(format);
  };

  return {
    data,
    loading: isLoading,
    error: error?.message || null,
    refetch,
    exportReport,
    isRefetching,
  };
};

export default useProfitLoss;
